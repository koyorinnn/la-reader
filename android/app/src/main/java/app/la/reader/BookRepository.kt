package app.la.reader

import android.app.Application
import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import android.util.AtomicFile
import android.graphics.Bitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import org.readium.r2.shared.publication.Publication
import org.readium.r2.shared.publication.services.cover
import org.readium.r2.shared.util.asset.AssetRetriever
import org.readium.r2.shared.util.http.DefaultHttpClient
import org.readium.r2.shared.util.toUrl
import org.readium.r2.streamer.PublicationOpener
import org.readium.r2.streamer.parser.DefaultPublicationParser
import java.io.File
import java.io.InputStream
import java.security.MessageDigest
import java.util.UUID
import java.util.zip.ZipFile

class ReaderApplication : Application() { val repository by lazy { BookRepository(this) } }

class BookRepository(private val context: Context) {
    private val root = File(context.filesDir, "native-library").apply { mkdirs() }
    private val index = AtomicFile(File(root, "library-v2.json"))
    private val preferences = context.getSharedPreferences("la.native", Context.MODE_PRIVATE)
    private val lock = Mutex()
    private val _books = MutableStateFlow<List<Book>>(emptyList())
    val books = _books.asStateFlow()
    val settings = MutableStateFlow(loadSettings())
    val error = MutableStateFlow<String?>(null)
    private var writable = true
    private val http = DefaultHttpClient()
    private val retriever = AssetRetriever(context.contentResolver, http)
    private val opener = PublicationOpener(DefaultPublicationParser(context, assetRetriever = retriever, httpClient = http, pdfFactory = null))
    init {
        try {
            if (index.baseFile.exists()) {
                val array = JSONArray(index.openRead().bufferedReader().use { it.readText() })
                _books.value = (0 until array.length()).map { Book.parse(array.getJSONObject(it)) }
            } else migrateLegacy()
        } catch (e: Exception) { writable = false; error.value = "Không mở được thư viện. Dữ liệu gốc vẫn được giữ. ${e.localizedMessage}" }
    }
    fun file(book: Book) = File(root, "${book.id}.${book.format}")
    fun cover(book: Book) = File(root, "${book.id}.jpg")
    fun book(id: String) = books.value.firstOrNull { it.id == id }
    fun saveSettings(value: ReaderSettings) { settings.value = value; preferences.edit().putString("settings", value.json()).apply() }
    private fun loadSettings(): ReaderSettings {
        preferences.getString("settings", null)?.let { return ReaderSettings.parse(it) }
        return runCatching {
            val raw = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE).getString("la.settings.v1", null) ?: return ReaderSettings()
            val old = JSONObject(raw)
            ReaderSettings(theme = old.optString("theme", "paper"), fontSize = old.optDouble("fontSize", 19.0).coerceIn(14.0,32.0), lineHeight = old.optDouble("lineHeight",1.7).coerceIn(1.3,2.2), epubDouble = old.optString("epubLayout") != "single", comicDouble = old.optString("comicLayout") == "double", rtl = old.optString("comicDirection") == "rtl", motion = old.optString("pageAnimation", "curl"))
        }.getOrDefault(ReaderSettings())
    }
    suspend fun open(book: Book): Publication = openFile(file(book))
    private suspend fun openFile(file: File): Publication {
        val asset = retriever.retrieve(file.toUrl(isDirectory = false)).getOrNull() ?: error("Không nhận diện được tệp sách.")
        return opener.open(asset, allowUserInteraction = false).getOrNull()?.takeIf { it.readingOrder.isNotEmpty() } ?: error("Sách có DRM hoặc không có nội dung đọc được.")
    }
    suspend fun importUri(uri: Uri) {
        val name = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null } ?: uri.lastPathSegment.orEmpty()
        withContext(Dispatchers.IO) { context.contentResolver.openInputStream(uri)?.use { importStream(name, it) } ?: error("Không mở được tệp.") }
    }
    suspend fun importStream(name: String, input: InputStream) = withContext(Dispatchers.IO) {
        lock.withLock {
            check(writable) { "Thư viện đang được bảo vệ; chưa ghi đè dữ liệu." }
            val format = name.substringAfterLast('.', "").lowercase()
            require(format in listOf("epub", "cbz")) { "Chọn tệp EPUB hoặc CBZ." }
            val staged = File(root, "import-${UUID.randomUUID()}.$format")
            try {
                val digest = MessageDigest.getInstance("SHA-256")
                staged.outputStream().use { output ->
                    val buffer = ByteArray(65536); var total = 0L
                    while (true) { val count = input.read(buffer); if (count == -1) break; total += count; require(total <= 100L*1024*1024) { "Tệp phải nhỏ hơn 100 MB." }; output.write(buffer, 0, count); digest.update(buffer, 0, count) }
                }
                val id = digest.digest().joinToString("") { "%02x".format(it) }
                if (book(id) != null) return@withLock
                ArchiveInspector.validate(staged)
                val publication = openFile(staged)
                val book = try {
                    val book = Book(id, publication.metadata.title ?: name.substringBeforeLast('.'), publication.metadata.authors.joinToString(", ") { it.name }, format, name)
                    publication.cover()?.let { bitmap -> cover(book).outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, 82, it) } }
                    book
                } finally { publication.close() }
                check(staged.renameTo(file(book))) { "Không lưu được tệp sách." }
                try { persist(books.value + book); _books.value = books.value + book }
                catch (e: Exception) { file(book).delete(); throw e }
            } finally { staged.delete() }
        }
    }
    suspend fun position(id: String, locator: String?, page: Int, progress: Double) = mutate { list -> list.map { if (it.id == id) it.copy(locator = locator, page = page, progress = progress.coerceIn(0.0, 1.0), lastReadAt = System.currentTimeMillis()) else it } }
    suspend fun bookmark(id: String, mark: Bookmark) = mutate { list -> list.map { book ->
        if (book.id != id) book else {
            val exists = book.bookmarks.any { it.locator == mark.locator && it.page == mark.page }
            book.copy(bookmarks = if (exists) book.bookmarks.filterNot { it.locator == mark.locator && it.page == mark.page } else book.bookmarks + mark)
        }
    } }
    suspend fun deleteBookmark(id: String, mark: String) = mutate { list -> list.map { if (it.id == id) it.copy(bookmarks = it.bookmarks.filterNot { m -> m.id == mark }) else it } }
    suspend fun delete(book: Book) { mutate { list -> list.filterNot { it.id == book.id } }; withContext(Dispatchers.IO) { file(book).delete(); cover(book).delete() } }
    private suspend fun mutate(change: (List<Book>) -> List<Book>) = withContext(Dispatchers.IO) {
        lock.withLock { val changed = change(books.value); persist(changed); _books.value = changed }
    }
    private fun persist(value: List<Book>) {
        check(writable) { "Thư viện đang được bảo vệ." }
        val stream = index.startWrite()
        try { stream.write(JSONArray(value.map { it.json() }).toString().toByteArray()); index.finishWrite(stream) }
        catch (e: Exception) { index.failWrite(stream); throw e }
    }
    private fun migrateLegacy() {
        val raw = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE).getString("la.library.v1", null) ?: return
        val rows = JSONArray(raw); val migrated = mutableListOf<Book>()
        for (i in 0 until rows.length()) {
            val row = rows.getJSONObject(i); if (row.optBoolean("demo")) continue
            val id = row.getString("id"); require(ReaderPolicy.validID(id))
            val format = row.getString("format"); require(format in listOf("epub", "cbz"))
            val marks = row.optJSONArray("bookmarks") ?: JSONArray()
            val progress = row.optDouble("progress", 0.0).coerceIn(0.0, 1.0)
            val book = Book(id, row.getString("title"), row.optString("author"), format, row.optString("filename"), row.optLong("addedAt"), row.optLong("lastReadAt"), progress,
                page = if (format == "cbz") row.optString("location").toIntOrNull() ?: 0 else 0,
                bookmarks = (0 until marks.length()).map { val mark = marks.getJSONObject(it); Bookmark(label = mark.optString("label", "Dấu trang cũ"), locator = if (format == "epub") mark.optString("location") else null, page = if (format == "cbz") mark.optString("location").toIntOrNull() else null, progress = progress) })
            val old = File(context.filesDir, "books/$id.zip")
            check(old.isFile) { "Thiếu tệp ${book.title}. Chưa thay đổi thư viện cũ." }
            if (!file(book).exists()) old.copyTo(file(book))
            row.optString("cover").substringAfter(',', "").takeIf { it.isNotEmpty() }?.let { base64 -> runCatching { cover(book).writeBytes(android.util.Base64.decode(base64, android.util.Base64.DEFAULT)) } }
            migrated.add(book)
        }
        persist(migrated); _books.value = migrated
    }
}

object ArchiveInspector {
    fun validate(file: File) {
        require(file.length() in 1..100L*1024*1024) { "Tệp phải nhỏ hơn 100 MB." }
        ZipFile(file).use { zip ->
            val names = mutableSetOf<String>(); var count = 0; var total = 0L
            val entries = zip.entries()
            while (entries.hasMoreElements()) {
                val entry = entries.nextElement(); count++
                require(count <= 5000 && entry.size in 0..40L*1024*1024) { "Sách vượt giới hạn giải nén." }
                val name = entry.name
                require(name.isNotEmpty() && !name.startsWith('/') && '\\' !in name && ':' !in name && '\u0000' !in name && ".." !in name.split('/') && names.add(name)) { "Đường dẫn trong ZIP không hợp lệ." }
                require(entry.method in listOf(0, 8)) { "Kiểu nén không được hỗ trợ." }
                total += entry.size; require(total <= 300L*1024*1024) { "Sách vượt giới hạn giải nén." }
                // Validate actual stream sizes as well as the central directory before parsing HTML/images.
                if (!entry.isDirectory) zip.getInputStream(entry).use { input ->
                    val buffer = ByteArray(65536); var actual = 0L
                    while (true) { val n = input.read(buffer); if (n == -1) break; actual += n; require(actual <= entry.size && actual <= 40L*1024*1024) { "Tệp ZIP bị lỗi." } }
                    require(actual == entry.size) { "Tệp ZIP bị cắt ngắn." }
                }
            }
            require(count > 0) { "Tệp ZIP trống." }
        }
    }
}
