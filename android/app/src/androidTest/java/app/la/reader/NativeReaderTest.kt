package app.la.reader

import android.content.Intent
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import org.junit.Rule
import org.junit.rules.TestName
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class NativeReaderTest {
    @get:Rule val testName = TestName()
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val device get() = UiDevice.getInstance(instrumentation)
    private val application get() = instrumentation.targetContext.applicationContext as ReaderApplication

    @Test fun epubTapZonesAndSettings() {
        val book = import("Native-reader.epub", "epub")
        launch(book)
        assertTrue(device.wait(Until.hasObject(By.desc("Cài đặt đọc")), 30000))
        assertTrue(device.wait(Until.hasObject(By.textContains("%")), 30000))
        assertTrue(device.wait(Until.hasObject(By.desc("Ẩn thanh điều khiển").enabled(true)), 30000))
        device.click(device.displayWidth/2, device.displayHeight/2)
        assertTrue(device.wait(Until.gone(By.desc("Ẩn thanh điều khiển")), 5000))
        device.click(device.displayWidth/2, device.displayHeight/2)
        assertTrue(device.wait(Until.hasObject(By.desc("Ẩn thanh điều khiển")), 5000))
        val before = device.findObject(By.textContains("%")).text
        device.click((device.displayWidth*.75).toInt(), device.displayHeight/2)
        assertTrue(device.wait(Until.gone(By.text(before)), 10000))
        device.waitForIdle()
        device.findObject(By.desc("Cài đặt đọc")).click()
        assertTrue(device.wait(Until.hasObject(By.desc("Hai trang khi xoay ngang")), 5000))
        screenshot("android-native-epub-settings")
        device.findObject(By.text("Xong")).click()
        landscape()
        screenshot("android-native-epub-landscape")
        device.click(device.displayWidth/2, device.displayHeight/2)
        assertTrue(device.wait(Until.gone(By.desc("Ẩn thanh điều khiển")), 5000))
    }
    @Test fun cbzTwoPagesAndProgressSurviveReopen() {
        val book = import("Native-comic.cbz", "cbz")
        launch(book)
        assertTrue(device.wait(Until.hasObject(By.textContains("/ 5")), 30000))
        landscape()
        device.findObject(By.desc("Cài đặt đọc")).click()
        assertTrue(device.wait(Until.hasObject(By.desc("Hai trang khi xoay ngang")), 5000))
        // Compose exposes the merged label as a virtual child of the checkable row.
        val label = device.findObject(By.desc("Hai trang khi xoay ngang"))
        val toggle = generateSequence(label) { it.parent }.firstOrNull { it.isCheckable }
        assertNotNull("The double-page switch must be accessible", toggle)
        if (toggle != null && !toggle.isChecked) toggle.click()
        device.findObject(By.text("Xong")).click()
        assertTrue(device.wait(Until.hasObject(By.text("1–2 / 5")), 10000))
        device.click((device.displayWidth*.75).toInt(), device.displayHeight/2)
        assertTrue(device.wait(Until.hasObject(By.text("3–4 / 5")), 10000))
        screenshot("android-native-cbz-spread")
        device.findObject(By.desc("Về thư viện")).click()
        launch(book)
        assertTrue(device.wait(Until.hasObject(By.text("3–4 / 5")), 30000))
    }
    private fun import(name: String, format: String): Book = runBlocking {
        instrumentation.context.assets.open(name).use { application.repository.importStream(name, it) }
        application.repository.books.value.first { it.format == format }
    }
    private fun launch(book: Book) {
        application.startActivity(Intent(application, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
        assertTrue(device.wait(Until.hasObject(By.text(book.title)), 10000))
        screenshot("android-native-library-${book.format}")
        device.findObject(By.text(book.title)).click()
    }
    private fun screenshot(name: String) {
        // AGP removes app data after the test run. Shell-owned diagnostics survive it.
        device.executeShellCommand("mkdir -p /sdcard/Download/la-reader-tests")
        device.executeShellCommand("screencap -p /sdcard/Download/la-reader-tests/$name.png")
        val hierarchy = File(instrumentation.targetContext.cacheDir, "$name.xml")
        device.dumpWindowHierarchy(hierarchy)
        println(device.executeShellCommand("run-as app.la.reader cat ${hierarchy.absolutePath}"))
    }
    private fun landscape() {
        device.setOrientationNatural(); device.waitForIdle()
        if (device.displayWidth < device.displayHeight) { device.setOrientationLeft(); device.waitForIdle() }
    }
    @After fun cleanup() { screenshot("android-native-${testName.methodName}-last"); device.setOrientationNatural(); device.unfreezeRotation() }
}
