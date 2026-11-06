package app.la.reader

import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

data class ReaderSettings(val theme: String = "paper", val fontSize: Double = 19.0, val lineHeight: Double = 1.7,
    val epubDouble: Boolean = true, val comicDouble: Boolean = false, val rtl: Boolean = false, val motion: String = "curl") {
    fun json() = JSONObject().put("theme", theme).put("fontSize", fontSize).put("lineHeight", lineHeight)
        .put("epubDouble", epubDouble).put("comicDouble", comicDouble).put("rtl", rtl).put("motion", motion).toString()
    companion object {
        fun parse(raw: String?): ReaderSettings = runCatching {
            val j = JSONObject(raw ?: "{}")
            ReaderSettings(j.optString("theme", "paper").takeIf { it in listOf("paper", "sepia", "dark") } ?: "paper",
                j.optDouble("fontSize", 19.0).coerceIn(14.0, 32.0), j.optDouble("lineHeight", 1.7).coerceIn(1.3, 2.2),
                j.optBoolean("epubDouble", true), j.optBoolean("comicDouble"), j.optBoolean("rtl"),
                j.optString("motion", "curl").takeIf { it in listOf("curl", "slide", "none") } ?: "curl")
        }.getOrDefault(ReaderSettings())
    }
}
data class Bookmark(val id: String = UUID.randomUUID().toString(), val label: String, val locator: String? = null, val page: Int? = null, val progress: Double = 0.0) {
    fun json() = JSONObject().put("id", id).put("label", label).put("locator", locator).put("page", page).put("progress", progress)
    companion object { fun parse(j: JSONObject) = Bookmark(j.getString("id"), j.getString("label"), j.optString("locator").takeIf { it.isNotEmpty() }, if (j.has("page")) j.getInt("page") else null, j.optDouble("progress", 0.0)) }
}
data class Book(val id: String, val title: String, val author: String, val format: String, val filename: String,
    val addedAt: Long = System.currentTimeMillis(), val lastReadAt: Long = 0, val progress: Double = 0.0,
    val locator: String? = null, val page: Int = 0, val bookmarks: List<Bookmark> = emptyList()) {
    fun json() = JSONObject().put("id", id).put("title", title).put("author", author).put("format", format).put("filename", filename)
        .put("addedAt", addedAt).put("lastReadAt", lastReadAt).put("progress", progress).put("locator", locator).put("page", page)
        .put("bookmarks", JSONArray(bookmarks.map { it.json() }))
    companion object {
        fun parse(j: JSONObject): Book {
            val id = j.getString("id"); require(ReaderPolicy.validID(id))
            val format = j.getString("format"); require(format in listOf("epub", "cbz"))
            val marks = j.optJSONArray("bookmarks") ?: JSONArray()
            return Book(id, j.getString("title"), j.optString("author"), format, j.optString("filename"), j.optLong("addedAt"), j.optLong("lastReadAt"), j.optDouble("progress", 0.0).coerceIn(0.0, 1.0), j.optString("locator").takeIf { it.isNotEmpty() }, j.optInt("page"), (0 until marks.length()).map { Bookmark.parse(marks.getJSONObject(it)) })
        }
    }
}
object ReaderPolicy {
    enum class Tap { LEFT, CENTER, RIGHT }
    fun tap(x: Float, width: Float): Tap? = if (!x.isFinite() || width <= 0 || x < 0 || x > width) null else if (x < width*.3f) Tap.LEFT else if (x > width*.7f) Tap.RIGHT else Tap.CENTER
    fun pages(width: Int, height: Int, double: Boolean): Int = if (double && width > height && width >= 600) 2 else 1
    fun spread(page: Int, count: Int, pages: Int): List<Int> {
        if (count <= 0) return emptyList()
        val size = pages.coerceIn(1, 2); val start = page.coerceIn(0, count-1) / size * size
        return (start until minOf(count, start+size)).toList()
    }
    fun validID(id: String) = id.matches(Regex("[a-f0-9]{64}"))
}
