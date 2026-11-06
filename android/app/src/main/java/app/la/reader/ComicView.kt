package app.la.reader

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.*
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import android.view.ViewGroup
import android.view.animation.AccelerateDecelerateInterpolator
import kotlin.math.abs

class ComicView(context: Context, private val tap: (Float, Float) -> Unit, private val turn: (Boolean) -> Unit) : View(context) {
    private var images: List<Bitmap> = emptyList()
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    private var zoom = 1f; private var dx = 0f; private var dy = 0f
    private val scale = ScaleGestureDetector(context, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
        override fun onScale(detector: ScaleGestureDetector): Boolean { zoom = (zoom*detector.scaleFactor).coerceIn(1f, 4f); constrain(); invalidate(); return true }
    })
    private val gesture = GestureDetector(context, object : GestureDetector.SimpleOnGestureListener() {
        override fun onDown(e: MotionEvent) = true
        override fun onSingleTapConfirmed(e: MotionEvent): Boolean { if (zoom <= 1.02f) { performClick(); tap(e.x, width.toFloat()) }; return true }
        override fun onDoubleTap(e: MotionEvent): Boolean { zoom = if (zoom > 1.02f) 1f else 2f; dx = 0f; dy = 0f; invalidate(); return true }
        override fun onScroll(first: MotionEvent?, event: MotionEvent, distanceX: Float, distanceY: Float): Boolean {
            if (zoom > 1.02f) { dx -= distanceX; dy -= distanceY; constrain(); invalidate() }; return true
        }
        override fun onFling(first: MotionEvent?, event: MotionEvent, vx: Float, vy: Float): Boolean {
            if (first != null && zoom <= 1.02f && abs(event.x-first.x) > 55*resources.displayMetrics.density && abs(vx) > abs(vy)*1.5) turn(event.x < first.x)
            return true
        }
    })
    init { isClickable = true; contentDescription = "Trang truyện. Chạm hai bên để chuyển trang, chạm giữa để ẩn hoặc hiện điều khiển. Chụm hai ngón để phóng to." }
    fun show(bitmaps: List<Bitmap>, color: Int) { images = bitmaps; setBackgroundColor(color); zoom = 1f; dx = 0f; dy = 0f; invalidate() }
    private fun constrain() { if (zoom <= 1.02f) { dx = 0f; dy = 0f } else { dx = dx.coerceIn(-width*(zoom-1)/2, width*(zoom-1)/2); dy = dy.coerceIn(-height*(zoom-1)/2, height*(zoom-1)/2) } }
    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas); if (images.isEmpty()) return
        canvas.save(); canvas.translate(dx, dy); canvas.scale(zoom, zoom, width/2f, height/2f)
        val cell = width.toFloat()/images.size
        images.forEachIndexed { i, bitmap ->
            val ratio = minOf((cell-4)/bitmap.width, height.toFloat()/bitmap.height)
            val w = bitmap.width*ratio; val h = bitmap.height*ratio
            val left = i*cell+(cell-w)/2; val top = (height-h)/2
            canvas.drawBitmap(bitmap, null, RectF(left, top, left+w, top+h), paint)
        }; canvas.restore()
    }
    override fun onTouchEvent(event: MotionEvent): Boolean { scale.onTouchEvent(event); if (!scale.isInProgress && event.pointerCount == 1) gesture.onTouchEvent(event); return true }
    override fun performClick(): Boolean { super.performClick(); return true }
}

class PageTurnView(context: Context, private val image: Bitmap, private val forward: Boolean, private val motion: String, private val done: () -> Unit) : View(context) {
    private var fraction = 0f
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    private var animator: ValueAnimator? = null
    init { isClickable = true; importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO }
    fun start() {
        animator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = if (motion == "curl") 420 else 240
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener { fraction = it.animatedValue as Float; invalidate() }
            addListener(object : android.animation.AnimatorListenerAdapter() { override fun onAnimationEnd(animation: android.animation.Animator) { (parent as? ViewGroup)?.removeView(this@PageTurnView); done() } })
            start()
        }
    }
    override fun onDraw(canvas: Canvas) {
        canvas.save()
        if (motion == "slide") canvas.translate((if (forward) -1 else 1)*width*fraction, 0f)
        else {
            val camera = Camera(); val matrix = Matrix(); camera.save(); camera.setLocation(0f, 0f, -12f)
            camera.rotateY((if (forward) -1 else 1)*90*fraction); camera.getMatrix(matrix); camera.restore()
            val pivot = if (forward) 0f else width.toFloat()
            matrix.preTranslate(-pivot, -height/2f); matrix.postTranslate(pivot, height/2f); canvas.concat(matrix)
            paint.alpha = (255*(1-fraction*.5f)).toInt()
        }
        canvas.drawBitmap(image, null, Rect(0,0,width,height), paint); canvas.restore()
    }
    override fun onDetachedFromWindow() { val running = animator; animator = null; if (running?.isRunning == true) running.cancel(); super.onDetachedFromWindow() }
}
