package app.la.reader

import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class ReaderPolicyTest {
    @Test fun tapZonesWorkAcrossTabletAndPhoneWidths() {
        for (width in listOf(390f, 600f, 744f, 834f, 1194f, 1366f)) {
            assertEquals(ReaderPolicy.Tap.LEFT, ReaderPolicy.tap(width*.25f, width))
            assertEquals(ReaderPolicy.Tap.CENTER, ReaderPolicy.tap(width*.5f, width))
            assertEquals(ReaderPolicy.Tap.RIGHT, ReaderPolicy.tap(width*.75f, width))
            assertNull(ReaderPolicy.tap(-1f, width))
        }
    }
    @Test fun doublePagesAreContiguousEvenWithAnOddLastPage() {
        for (count in 1..15) assertEquals((0 until count).toList(), (0 until count step 2).flatMap { ReaderPolicy.spread(it, count, 2) })
    }
    @Test fun narrowAndPortraitWindowsRemainSinglePage() {
        assertEquals(1, ReaderPolicy.pages(834, 1194, true)); assertEquals(2, ReaderPolicy.pages(1194, 834, true))
        assertEquals(1, ReaderPolicy.pages(500, 400, true)); assertEquals(1, ReaderPolicy.pages(1194, 834, false))
    }
    @Test fun zipTraversalIsRejectedButValidArchiveOpens() {
        for (path in listOf("chapter.xhtml", "../escape.xhtml", "/absolute.xhtml")) {
            val file = File.createTempFile("archive-test", ".zip")
            try {
                ZipOutputStream(file.outputStream()).use { it.putNextEntry(ZipEntry(path)); it.write("book".toByteArray()); it.closeEntry() }
                if (path == "chapter.xhtml") ArchiveInspector.validate(file)
                else assertThrows(IllegalArgumentException::class.java) { ArchiveInspector.validate(file) }
            } finally { file.delete() }
        }
    }
    @Test fun malformedZipIsRejected() {
        val file = File.createTempFile("archive-test", ".zip")
        try { file.writeText("not a zip"); assertThrows(Exception::class.java) { ArchiveInspector.validate(file) } } finally { file.delete() }
    }
    @Test fun bookmarksAndProgressRoundTrip() {
        val book = Book("a".repeat(64), "Một cuốn sách", "Tác giả", "epub", "book.epub", progress = .4, bookmarks = listOf(Bookmark(label = "40%", locator = "{\"href\":\"chapter.xhtml\"}", progress = .4)))
        assertEquals(book, Book.parse(book.json()))
        assertFalse(ReaderPolicy.validID("../../outside"))
    }
}
