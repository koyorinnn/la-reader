@file:OptIn(org.readium.r2.shared.ExperimentalReadiumApi::class)
package app.la.reader

import android.animation.ValueAnimator
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.net.Uri
import android.os.Bundle
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import androidx.compose.runtime.*
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.*
import org.json.JSONObject
import org.readium.r2.navigator.epub.EpubNavigatorFactory
import org.readium.r2.navigator.epub.EpubNavigatorFragment
import org.readium.r2.navigator.epub.EpubPreferences
import org.readium.r2.navigator.input.InputListener
import org.readium.r2.navigator.input.TapEvent
import org.readium.r2.navigator.preferences.ColumnCount
import org.readium.r2.navigator.preferences.Spread
import org.readium.r2.navigator.preferences.Theme
import org.readium.r2.navigator.preferences.ReadingProgression
import org.readium.r2.shared.publication.Publication
import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.publication.Link
import org.readium.r2.shared.publication.services.positions
import org.readium.r2.shared.util.AbsoluteUrl

class ReaderActivity : FragmentActivity() {
    private val repository get() = (application as ReaderApplication).repository
    lateinit var book: Book; private set
    var settings by mutableStateOf(ReaderSettings()); private set
    var chrome by mutableStateOf(true); private set
    var panel by mutableIntStateOf(0)
    var progress by mutableDoubleStateOf(0.0); private set
    var label by mutableStateOf("Đang mở sách…"); private set
    var loading by mutableStateOf(true); private set
    var failure by mutableStateOf<String?>(null)
    var page by mutableIntStateOf(0); private set
    var publication by mutableStateOf<Publication?>(null); private set
    var pages by mutableIntStateOf(1); private set
    var headerBounds = Rect.Zero
    var footerBounds = Rect.Zero
    private var locator: Locator? = null
    private var positions: List<Locator> = emptyList()
    private lateinit var root: FrameLayout
    private lateinit var content: FrameLayout
    private var epub: EpubNavigatorFragment? = null
    private var comic: ComicView? = null
    private var opening: Job? = null
    private var imageJob: Job? = null
    private var saving: Job? = null
    private var turning = false
    private val imageCache = object : android.util.LruCache<Int, Bitmap>(48*1024*1024) { override fun sizeOf(key: Int, value: Bitmap) = value.allocationByteCount }
    val currentBook get() = repository.book(book.id) ?: book
    val bookmarked get() = currentBook.bookmarks.any { if (book.format == "cbz") it.page == page else it.locator == locator?.toJSON()?.toString() }
    val bookmark get() = Bookmark(label = label, locator = locator?.toJSON()?.toString(), page = if (book.format == "cbz") page else null, progress = progress)

    override fun onCreate(savedInstanceState: Bundle?) {
        // Reopen from the durable locator after process death. Never restore a Readium Fragment
        // before its asynchronously opened Publication and FragmentFactory are available.
        super.onCreate(null)
        book = repository.book(intent.getStringExtra("book") ?: "") ?: run { finish(); return }
        settings = repository.settings.value; page = book.page; progress = book.progress
        WindowCompat.setDecorFitsSystemWindows(window, false)
        root = FrameLayout(this); content = FrameLayout(this).apply { id = View.generateViewId() }
        root.addView(content, FrameLayout.LayoutParams(-1, -1))
        val controls = ComposeView(this).apply { setContent { ReaderTheme(dark = settings.theme == "dark") { ReaderControls(this@ReaderActivity, repository) } } }
        // A transparent Compose root still consumes Android touch dispatch. Only route
        // gestures starting on visible controls to it; all page input reaches Readium/CBZ.
        val overlay = object : FrameLayout(this) {
            private var captureGesture = false
            override fun dispatchTouchEvent(event: MotionEvent): Boolean {
                if (event.actionMasked == MotionEvent.ACTION_DOWN) {
                    val point = Offset(event.x, event.y)
                    captureGesture = failure != null || panel != 0 ||
                        (chrome && (headerBounds.contains(point) || footerBounds.contains(point)))
                    trace("down=$point controls=$captureGesture header=$headerBounds footer=$footerBounds loading=$loading panel=$panel")
                }
                return captureGesture && super.dispatchTouchEvent(event)
            }
        }
        overlay.addView(controls, FrameLayout.LayoutParams(-1, -1))
        root.addView(overlay, FrameLayout.LayoutParams(-1, -1)); setContentView(root)
        applyAppearance()
        root.setOnApplyWindowInsetsListener { _, insets ->
            val bars = WindowInsetsCompat.toWindowInsetsCompat(insets).getInsetsIgnoringVisibility(WindowInsetsCompat.Type.systemBars())
            val params = content.layoutParams as FrameLayout.LayoutParams
            params.topMargin = bars.top + dp(56); params.bottomMargin = bars.bottom + dp(76)
            params.leftMargin = bars.left; params.rightMargin = bars.right; content.layoutParams = params
            insets
        }
        content.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> updateLayout() }
        opening = lifecycleScope.launch {
            try {
                val pub = withContext(Dispatchers.IO) { ArchiveInspector.validate(repository.file(book)); repository.open(book) }
                publication = pub; positions = pub.positions()
                locator = book.locator?.let { runCatching { Locator.fromJSON(JSONObject(it)) }.getOrNull() }
                if (locator == null && progress > 0) locator = positions.minByOrNull { kotlin.math.abs((it.locations.totalProgression ?: 0.0)-progress) }
                if (book.format == "epub") openEPUB(pub) else {
                    comic = ComicView(this@ReaderActivity, ::tap) { forward -> turn(if (settings.rtl) !forward else forward) }.also { content.addView(it, FrameLayout.LayoutParams(-1, -1)) }
                    showComic(page)
                }
                if (book.format == "cbz") loading = false
                updateLayout()
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { loading = false; failure = "Không mở được sách. ${e.localizedMessage}" }
        }
    }
    private fun openEPUB(pub: Publication) {
        val factory = EpubNavigatorFactory(pub).createFragmentFactory(initialLocator = locator, initialPreferences = epubPreferences(), paginationListener = object : EpubNavigatorFragment.PaginationListener {
            override fun onPageLoaded() { loading = false }
        }, listener = object : EpubNavigatorFragment.Listener {
            override fun onExternalLinkActivated(url: AbsoluteUrl) { if (url.toString().startsWith("https://") || url.toString().startsWith("http://")) runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url.toString()))) } }
        })
        val navigator = factory.instantiate(classLoader, EpubNavigatorFragment::class.java.name) as EpubNavigatorFragment
        supportFragmentManager.beginTransaction().add(content.id, navigator, "publication").commitNow()
        epub = navigator
        navigator.addInputListener(object : InputListener {
            override fun onTap(event: TapEvent): Boolean { tap(event.point.x, navigator.publicationView.width.toFloat()); return true }
        })
        lifecycleScope.launch {
            navigator.currentLocator.collect { location ->
                locator = location; progress = location.locations.totalProgression ?: progress
                label = "${(progress*100).toInt()}%"; savePosition()
            }
        }
    }
    private fun epubPreferences() = EpubPreferences(columnCount = if (pages == 2) ColumnCount.TWO else ColumnCount.ONE,
        fontSize = settings.fontSize/19.0, lineHeight = settings.lineHeight, pageMargins = 1.3, publisherStyles = false,
        scroll = false, spread = if (pages == 2) Spread.ALWAYS else Spread.NEVER,
        theme = when (settings.theme) { "dark" -> Theme.DARK; "sepia" -> Theme.SEPIA; else -> Theme.LIGHT })
    private fun updateLayout() {
        val density = resources.displayMetrics.density
        val count = ReaderPolicy.pages((root.width/density).toInt(), (root.height/density).toInt(), if (book.format == "epub") settings.epubDouble else settings.comicDouble)
        if (count != pages) { pages = count; epub?.submitPreferences(epubPreferences()); if (comic != null) showComic(page) }
    }
    fun updateSettings(value: ReaderSettings) {
        settings = value; repository.saveSettings(value); applyAppearance()
        updateLayout(); epub?.submitPreferences(epubPreferences()); if (comic != null) showComic(page)
    }
    private fun background() = when (settings.theme) { "dark" -> 0xFF101210.toInt(); "sepia" -> 0xFFFAF4E8.toInt(); else -> 0xFFFAFAF8.toInt() }
    private fun applyAppearance() {
        root.setBackgroundColor(background()); content.setBackgroundColor(background())
        WindowCompat.getInsetsController(window, root).apply {
            isAppearanceLightStatusBars = settings.theme != "dark"
            isAppearanceLightNavigationBars = settings.theme != "dark"
        }
    }
    private fun dp(value: Int) = (value*resources.displayMetrics.density).toInt()
    private fun tap(x: Float, width: Float) {
        trace("tap x=$x width=$width format=${book.format} loading=$loading turning=$turning panel=$panel")
        if (panel != 0 || turning) return
        val rtl = if (book.format == "cbz") settings.rtl else epub?.overflow?.value?.readingProgression == ReadingProgression.RTL
        when (ReaderPolicy.tap(x, width)) { ReaderPolicy.Tap.LEFT -> turn(rtl); ReaderPolicy.Tap.RIGHT -> turn(!rtl); ReaderPolicy.Tap.CENTER -> toggleChrome(); else -> Unit }
    }
    fun toggleChrome() {
        chrome = !chrome
        trace("chrome=$chrome")
        val controller = WindowCompat.getInsetsController(window, root)
        if (chrome) controller.show(WindowInsetsCompat.Type.systemBars()) else {
            controller.systemBarsBehavior = androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            controller.hide(WindowInsetsCompat.Type.systemBars())
        }
    }
    fun turn(forward: Boolean) {
        if (turning || loading) return
        if (comic != null) {
            val next = page + if (forward) pages else -pages
            if (next in 0 until (publication?.readingOrder?.size ?: 0)) showComic(next, forward)
            return
        }
        val navigator = epub ?: return
        val animated = settings.motion != "none" && ValueAnimator.areAnimatorsEnabled()
        val flip = animated && settings.motion == "curl"
        val image = if (flip) snapshot(content) else null
        val changed = if (forward) navigator.goForward(animated && !flip) else navigator.goBackward(animated && !flip)
        if (changed && image != null) {
            turning = true
            val overlay = PageTurnView(this, image, forward, "curl") { turning = false }
            root.addView(overlay, FrameLayout.LayoutParams(content.width, content.height).apply { leftMargin = content.left; topMargin = content.top })
            overlay.start()
        }
    }
    fun showComic(requested: Int, forward: Boolean? = null) {
        trace("comic requested=$requested pages=$pages")
        val pub = publication ?: return; val view = comic ?: return
        val indices = ReaderPolicy.spread(requested, pub.readingOrder.size, pages)
        if (indices.isEmpty()) return
        imageJob?.cancel(); turning = true
        val old = if (forward != null && settings.motion != "none" && ValueAnimator.areAnimatorsEnabled()) snapshot(view) else null
        imageJob = lifecycleScope.launch {
            try {
                val bitmaps = withContext(Dispatchers.IO) { indices.map { index ->
                    imageCache[index] ?: run {
                        val data = pub.get(pub.readingOrder[index])?.read()?.getOrNull() ?: error("Không đọc được ảnh trang ${index+1}.")
                        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }; BitmapFactory.decodeByteArray(data, 0, data.size, bounds)
                        require(bounds.outWidth > 0 && bounds.outHeight > 0) { "Ảnh trang ${index+1} không được hỗ trợ." }
                        val options = BitmapFactory.Options().apply { var scale = 1; while (maxOf(bounds.outWidth, bounds.outHeight)/scale > 2400) scale *= 2; inSampleSize = scale }
                        val bitmap = BitmapFactory.decodeByteArray(data, 0, data.size, options) ?: error("Không giải mã được ảnh.")
                        imageCache.put(index, bitmap); bitmap
                    }
                } }
                page = indices.first(); view.show(if (settings.rtl) bitmaps.reversed() else bitmaps, background())
                progress = (indices.last()+1).toDouble()/pub.readingOrder.size
                label = if (indices.size == 2) "${page+1}–${indices.last()+1} / ${pub.readingOrder.size}" else "${page+1} / ${pub.readingOrder.size}"
                savePosition()
                if (old != null && forward != null) {
                    val overlay = PageTurnView(this@ReaderActivity, old, forward != settings.rtl, settings.motion) { turning = false }
                    content.addView(overlay, FrameLayout.LayoutParams(-1, -1)); overlay.start()
                } else turning = false
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { turning = false; failure = e.localizedMessage }
        }
    }
    fun seek(value: Double) {
        if (book.format == "cbz") showComic(((publication?.readingOrder?.size ?: 1)-1).times(value).toInt())
        else if (positions.isNotEmpty()) epub?.go(positions[((positions.size-1)*value).toInt().coerceIn(positions.indices)])
    }
    fun go(link: Link) { epub?.go(link); panel = 0 }
    fun go(mark: Bookmark) {
        if (mark.page != null) showComic(mark.page) else {
            val location = mark.locator?.let { runCatching { Locator.fromJSON(JSONObject(it)) }.getOrNull() }
            if (location != null) epub?.go(location) else seek(mark.progress)
        }; panel = 0
    }
    fun mark() { lifecycleScope.launch { runCatching { repository.bookmark(book.id, bookmark) }.onFailure { failure = it.localizedMessage } } }
    fun deleteMark(mark: Bookmark) { lifecycleScope.launch { runCatching { repository.deleteBookmark(book.id, mark.id) }.onFailure { failure = it.localizedMessage } } }
    private fun savePosition() {
        val current = locator?.toJSON()?.toString(); val page = page; val progress = progress
        saving?.cancel()
        saving = repository.enqueuePosition(book.id, current, page, progress)
    }
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean = when (keyCode) {
        KeyEvent.KEYCODE_DPAD_LEFT -> { turn(false); true }; KeyEvent.KEYCODE_DPAD_RIGHT -> { turn(true); true }
        KeyEvent.KEYCODE_ESCAPE -> { if (!chrome) toggleChrome() else finish(); true }; else -> super.onKeyDown(keyCode, event)
    }
    override fun onDestroy() { opening?.cancel(); imageJob?.cancel(); publication?.close(); imageCache.evictAll(); super.onDestroy() }
    private fun snapshot(view: View): Bitmap? = runCatching { if (view.width <= 0 || view.height <= 0) null else Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888).also { view.draw(Canvas(it)) } }.getOrNull()
    private fun trace(message: String) {
        if (applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE != 0) android.util.Log.d("ReaderInput", message)
    }
}
