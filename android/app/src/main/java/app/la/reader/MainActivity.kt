package app.la.reader

import android.content.Intent
import android.os.Bundle
import android.graphics.BitmapFactory
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.MenuBook
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
import androidx.core.view.WindowCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : FragmentActivity() {
    private val repository get() = (application as ReaderApplication).repository
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val dark = resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK == android.content.res.Configuration.UI_MODE_NIGHT_YES
        WindowCompat.getInsetsController(window, window.decorView).apply { isAppearanceLightStatusBars = !dark; isAppearanceLightNavigationBars = !dark }
        setContent { ReaderTheme { LibraryScreen(repository) { book -> startActivity(Intent(this, ReaderActivity::class.java).putExtra("book", book.id)) } } }
        if (intent.action == Intent.ACTION_VIEW) intent.data?.let { uri -> lifecycleScope.launch { runCatching { repository.importUri(uri) }.onFailure { repository.error.value = it.localizedMessage } } }
    }
}

@Composable fun ReaderTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val colors = if (dark) darkColorScheme(primary = Color(0xFFA3C7AE), primaryContainer = Color(0xFF2B4031), onPrimaryContainer = Color(0xFFDCEADC), secondary = Color(0xFFACBDAE), secondaryContainer = Color(0xFF303D32), onSecondaryContainer = Color(0xFFDCEADC), background = Color(0xFF151715), surface = Color(0xFF1C1E1C), surfaceContainer = Color(0xFF222722), surfaceVariant = Color(0xFF343B34))
        else lightColorScheme(primary = Color(0xFF3D614D), primaryContainer = Color(0xFFDFEADF), onPrimaryContainer = Color(0xFF193622), secondary = Color(0xFF526452), secondaryContainer = Color(0xFFE4EBE3), onSecondaryContainer = Color(0xFF243629), background = Color(0xFFFAFAF8), surface = Color(0xFFFAFAF8), surfaceContainer = Color(0xFFF0F1EC), surfaceVariant = Color(0xFFE3E7E0))
    MaterialTheme(colorScheme = colors, content = content)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun LibraryScreen(repository: BookRepository, open: (Book) -> Unit) {
    val books by repository.books.collectAsState(); val error by repository.error.collectAsState()
    var query by remember { mutableStateOf("") }; var shelf by remember { mutableStateOf("Thư viện") }
    var importing by remember { mutableStateOf(false) }; var alphabetical by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf<Book?>(null) }; var menu by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val importer = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        scope.launch {
            importing = true
            val errors = mutableListOf<String>()
            for (uri in uris) runCatching { repository.importUri(uri) }.onFailure { errors.add(it.localizedMessage ?: "Không nhập được sách.") }
            importing = false
            if (errors.isNotEmpty()) repository.error.value = errors.joinToString("\n")
        }
    }
    val shelves = listOf("Thư viện", "Đang đọc", "Đã đọc", "Sách", "Truyện tranh")
    val filtered = books.filter { book ->
        (query.isEmpty() || (book.title+" "+book.author).contains(query, ignoreCase = true)) && when (shelf) {
            "Đang đọc" -> book.lastReadAt > 0 && book.progress < .99; "Đã đọc" -> book.progress >= .99
            "Sách" -> book.format == "epub"; "Truyện tranh" -> book.format == "cbz"; else -> true
        }
    }.let { list -> if (alphabetical) list.sortedBy { it.title.lowercase() } else list.sortedByDescending { maxOf(it.lastReadAt, it.addedAt) } }
    Scaffold(topBar = {
        LargeTopAppBar(title = { Text(shelf, fontWeight = FontWeight.SemiBold) }, actions = {
            Box {
                IconButton(onClick = { menu = true }) { Icon(Icons.Outlined.Tune, "Hiển thị thư viện") }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    shelves.forEach { name -> DropdownMenuItem(text = { Text(name) }, onClick = { shelf = name; menu = false }) }
                    HorizontalDivider()
                    DropdownMenuItem(text = { Text(if (alphabetical) "Sắp xếp gần đây" else "Sắp xếp theo tên") }, onClick = { alphabetical = !alphabetical; menu = false })
                }
            }
            IconButton(enabled = !importing, onClick = { importer.launch(arrayOf("*/*")) }) { Icon(Icons.Outlined.Add, "Thêm sách") }
        })
    }) { padding ->
        BoxWithConstraints(Modifier.fillMaxSize().padding(padding)) {
            val tablet = maxWidth >= 840.dp
            Row(Modifier.fillMaxSize()) {
                if (tablet) {
                    PermanentDrawerSheet(Modifier.width(220.dp)) {
                        Text("Lá Reader", Modifier.padding(24.dp), style = MaterialTheme.typography.titleLarge)
                        shelves.forEach { name -> NavigationDrawerItem(label = { Text(name) }, selected = shelf == name, onClick = { shelf = name }, modifier = Modifier.padding(horizontal = 12.dp)) }
                    }
                }
                Column(Modifier.weight(1f)) {
                    OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 8.dp), placeholder = { Text("Tìm sách hoặc tác giả") }, leadingIcon = { Icon(Icons.Outlined.Search, null) }, singleLine = true, shape = RoundedCornerShape(18.dp))
                    if (importing) LinearProgressIndicator(Modifier.fillMaxWidth().padding(horizontal = 24.dp))
                    if (filtered.isEmpty()) {
                        Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                            Icon(Icons.AutoMirrored.Outlined.MenuBook, null, Modifier.size(52.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.height(20.dp)); Text(if (query.isNotEmpty()) "Không tìm thấy sách" else "Thư viện của bạn", style = MaterialTheme.typography.headlineSmall)
                            Spacer(Modifier.height(8.dp)); Text("Thêm EPUB hoặc CBZ để đọc offline.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.height(24.dp)); Button(enabled = !importing, onClick = { importer.launch(arrayOf("*/*")) }) { Icon(Icons.Outlined.Add, null); Spacer(Modifier.width(8.dp)); Text("Thêm sách") }
                        }
                    } else LazyVerticalGrid(columns = GridCells.Adaptive(if (tablet) 155.dp else 135.dp), contentPadding = PaddingValues(24.dp), horizontalArrangement = Arrangement.spacedBy(24.dp), verticalArrangement = Arrangement.spacedBy(28.dp)) {
                        items(filtered, key = { it.id }) { book -> BookTile(book, repository, { open(book) }, { deleting = book }) }
                    }
                }
            }
        }
    }
    error?.let { message -> AlertDialog(onDismissRequest = { repository.error.value = null }, title = { Text("Không thể hoàn tất") }, text = { Text(message) }, confirmButton = { TextButton(onClick = { repository.error.value = null }) { Text("Đóng") } }) }
    deleting?.let { book -> AlertDialog(onDismissRequest = { deleting = null }, title = { Text("Xóa khỏi thư viện?") }, text = { Text(book.title) }, confirmButton = { TextButton(onClick = { scope.launch { runCatching { repository.delete(book) }.onFailure { repository.error.value = it.localizedMessage }; deleting = null } }) { Text("Xóa sách") } }, dismissButton = { TextButton(onClick = { deleting = null }) { Text("Hủy") } }) }
}

@Composable private fun BookTile(book: Book, repository: BookRepository, open: () -> Unit, delete: () -> Unit) {
    val bitmap by produceState<android.graphics.Bitmap?>(null, book.id) { value = withContext(Dispatchers.IO) { BitmapFactory.decodeFile(repository.cover(book).path) } }
    var menu by remember { mutableStateOf(false) }
    Column(Modifier.clickable(onClick = open)) {
        Surface(shape = RoundedCornerShape(5.dp), shadowElevation = 4.dp, modifier = Modifier.fillMaxWidth().aspectRatio(.68f)) {
            Box(contentAlignment = Alignment.Center) {
                bitmap?.let { Image(it.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Fit) }
                    ?: Text(book.title, Modifier.padding(20.dp), style = MaterialTheme.typography.titleMedium)
            }
        }
        Spacer(Modifier.height(10.dp))
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Text(book.title, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleSmall)
                Text(book.author.ifBlank { book.format.uppercase() }, maxLines = 1, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Box {
                IconButton(onClick = { menu = true }, Modifier.size(36.dp)) { Icon(Icons.Outlined.MoreVert, "Tùy chọn ${book.title}") }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) { DropdownMenuItem(text = { Text("Xóa khỏi thư viện") }, onClick = { menu = false; delete() }) }
            }
        }
        if (book.lastReadAt > 0) LinearProgressIndicator(progress = { book.progress.toFloat() }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp).height(2.dp))
    }
}
