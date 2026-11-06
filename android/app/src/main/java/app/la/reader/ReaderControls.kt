package app.la.reader

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.List
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import org.readium.r2.shared.publication.Link

@Composable fun ReaderControls(reader: ReaderActivity, repository: BookRepository) {
    val library by repository.books.collectAsState()
    val book = library.firstOrNull { it.id == reader.book.id } ?: reader.book
    var slider by remember { mutableFloatStateOf(reader.progress.toFloat()) }
    var dragging by remember { mutableStateOf(false) }
    LaunchedEffect(reader.progress) { if (!dragging) slider = reader.progress.toFloat() }
    BackHandler { if (reader.panel != 0) reader.panel = 0 else if (!reader.chrome) reader.toggleChrome() else reader.finish() }
    Box(Modifier.fillMaxSize()) {
        if (reader.loading) CircularProgressIndicator(Modifier.align(Alignment.Center))
        AnimatedVisibility(reader.chrome, Modifier.align(Alignment.TopCenter), enter = fadeIn()+slideInVertically { -it }, exit = fadeOut()+slideOutVertically { -it }) {
            Row(Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                ControlSurface {
                    IconButton(onClick = { reader.finish() }) { Icon(Icons.Outlined.KeyboardArrowDown, "Về thư viện") }
                }
                Text(book.title, Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleSmall)
                ControlSurface {
                    Row {
                        if (book.format == "epub") IconButton(enabled = !reader.loading, onClick = { reader.panel = 2 }) { Icon(Icons.AutoMirrored.Outlined.List, "Mục lục") }
                        IconButton(enabled = !reader.loading, onClick = { reader.panel = 3 }) { Icon(if (reader.bookmarked) Icons.Outlined.BookmarkAdded else Icons.Outlined.BookmarkBorder, "Dấu trang") }
                        IconButton(enabled = !reader.loading, onClick = { reader.panel = 1 }) { Icon(Icons.Outlined.TextFields, "Cài đặt đọc") }
                    }
                }
            }
        }
        AnimatedVisibility(reader.chrome, Modifier.align(Alignment.BottomCenter), enter = fadeIn()+slideInVertically { it }, exit = fadeOut()+slideOutVertically { it }) {
            Box(Modifier.navigationBarsPadding().padding(horizontal = 18.dp, vertical = 10.dp).widthIn(max = 560.dp)) {
                ControlSurface {
                    Column(Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            IconButton(enabled = !reader.loading, onClick = { reader.turn(false) }) { Icon(Icons.Outlined.ChevronLeft, "Trang trước") }
                            Slider(slider, { slider = it; dragging = true }, Modifier.weight(1f), enabled = !reader.loading, onValueChangeFinished = { dragging = false; reader.seek(slider.toDouble()) })
                            IconButton(enabled = !reader.loading, onClick = { reader.turn(true) }) { Icon(Icons.Outlined.ChevronRight, "Trang sau") }
                            IconButton(enabled = !reader.loading, onClick = { reader.toggleChrome() }) { Icon(Icons.Outlined.Fullscreen, "Ẩn thanh điều khiển") }
                        }
                        Text(reader.label, Modifier.align(Alignment.CenterHorizontally).padding(bottom = 8.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
    if (reader.panel != 0) Dialog(onDismissRequest = { reader.panel = 0 }) {
        Surface(shape = RoundedCornerShape(28.dp), tonalElevation = 6.dp, modifier = Modifier.widthIn(max = 400.dp).fillMaxWidth().heightIn(max = 620.dp)) {
            Column(Modifier.padding(vertical = 12.dp)) {
                Row(Modifier.fillMaxWidth().padding(start = 24.dp, end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(when (reader.panel) { 1 -> "Cài đặt đọc"; 2 -> "Mục lục"; else -> "Dấu trang" }, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                    TextButton(onClick = { reader.panel = 0 }) { Text("Xong") }
                }
                when (reader.panel) {
                    1 -> SettingsPanel(reader)
                    2 -> {
                        val chapters = flatten(reader.publication?.tableOfContents.orEmpty())
                        LazyColumn { if (chapters.isEmpty()) item { Text("Sách không có mục lục.", Modifier.padding(24.dp)) }
                            items(chapters) { link -> TextButton(onClick = { reader.go(link) }, Modifier.fillMaxWidth().padding(horizontal = 12.dp)) { Text(link.title ?: "Chương", Modifier.fillMaxWidth()) } }
                        }
                    }
                    3 -> LazyColumn {
                        item { TextButton(onClick = { reader.mark() }, Modifier.fillMaxWidth()) { Text(if (reader.bookmarked) "Bỏ dấu trang hiện tại" else "Đánh dấu trang hiện tại") } }
                        items(book.bookmarks, key = { it.id }) { mark ->
                            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                                TextButton(onClick = { reader.go(mark) }, Modifier.weight(1f)) { Text(mark.label, Modifier.fillMaxWidth()) }
                                IconButton(onClick = { reader.deleteMark(mark) }) { Icon(Icons.Outlined.DeleteOutline, "Xóa dấu trang") }
                            }
                        }
                    }
                }
            }
        }
    }
    reader.failure?.let { error -> AlertDialog(onDismissRequest = { reader.failure = null }, title = { Text("Không đọc được sách") }, text = { Text(error) }, confirmButton = { TextButton(onClick = { reader.failure = null; if (reader.publication == null) reader.finish() }) { Text("Đóng") } }) }
}

@Composable private fun SettingsPanel(reader: ReaderActivity) {
    val settings = reader.settings
    LazyColumn(contentPadding = PaddingValues(horizontal = 24.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Text("Màu trang", style = MaterialTheme.typography.labelLarge); Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("paper" to "Sáng", "sepia" to "Giấy", "dark" to "Tối").forEach { (value, title) -> FilterChip(selected = settings.theme == value, onClick = { reader.updateSettings(settings.copy(theme = value)) }, label = { Text(title) }) }
        } }
        if (reader.book.format == "epub") {
            item { Text("Cỡ chữ · ${settings.fontSize.toInt()}"); Slider(settings.fontSize.toFloat(), { reader.updateSettings(settings.copy(fontSize = it.toDouble())) }, valueRange = 14f..32f, steps = 17) }
            item { Text("Giãn dòng · ${"%.1f".format(settings.lineHeight)}"); Slider(settings.lineHeight.toFloat(), { reader.updateSettings(settings.copy(lineHeight = it.toDouble())) }, valueRange = 1.3f..2.2f, steps = 8) }
        }
        item { HorizontalDivider(); Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Hai trang khi xoay ngang", Modifier.weight(1f))
            Switch(checked = if (reader.book.format == "epub") settings.epubDouble else settings.comicDouble, onCheckedChange = { reader.updateSettings(if (reader.book.format == "epub") settings.copy(epubDouble = it) else settings.copy(comicDouble = it)) })
        } }
        if (reader.book.format == "cbz") item { Row(verticalAlignment = Alignment.CenterVertically) { Text("Đọc từ phải sang trái", Modifier.weight(1f)); Switch(settings.rtl, { reader.updateSettings(settings.copy(rtl = it)) }) } }
        item { Text("Chuyển trang", style = MaterialTheme.typography.labelLarge); Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("curl" to "Lật trang", "slide" to "Trượt", "none" to "Không").forEach { (value, title) -> FilterChip(settings.motion == value, { reader.updateSettings(settings.copy(motion = value)) }, label = { Text(title) }) }
        } }
        item { Text("Chạm hai bên để chuyển trang. Chạm giữa để ẩn hoặc hiện điều khiển.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}
@Composable private fun ControlSurface(content: @Composable () -> Unit) {
    Surface(shape = RoundedCornerShape(28.dp), color = MaterialTheme.colorScheme.surfaceContainer.copy(alpha = .94f), shadowElevation = 5.dp, content = content)
}
private fun flatten(links: List<Link>): List<Link> = links.flatMap { listOf(it)+flatten(it.children) }
