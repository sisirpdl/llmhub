package com.llmhub

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.io.MemoryUsageSetting
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.encryption.InvalidPasswordException
import com.tom_roush.pdfbox.text.PDFTextStripper
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/** Real PDFs through the bundled Android parser; app UI/bridge checks are in docs/PDF_RAG.md. */
@RunWith(AndroidJUnit4::class)
class PdfExtractionTest {
  private fun fixture(name: String): File {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    PDFBoxResourceLoader.init(instrumentation.targetContext)
    val file = File(instrumentation.targetContext.cacheDir, "fixture-$name")
    instrumentation.context.assets.open(name).use { input -> file.outputStream().use { input.copyTo(it) } }
    return file
  }
  private fun <T> withPdf(name: String, block: (PDDocument) -> T): T {
    val file = fixture(name)
    try {
      val memory = MemoryUsageSetting.setupMixed(8L * 1024 * 1024, 64L * 1024 * 1024)
      memory.setTempDir(file.parentFile)
      return PDDocument.load(file, memory).use(block)
    } finally { file.delete() }
  }
  private fun text(document: PDDocument, page: Int): String = PDFTextStripper().apply {
    startPage = page; endPage = page; sortByPosition = false
  }.getText(document)

  @Test fun retainsPageTextAndColumns() {
    withPdf("text.pdf") { document ->
      assertEquals(2, document.numberOfPages)
      assertTrue(text(document, 1).contains("Photosynthesis"))
      assertFalse(text(document, 1).contains("marigold"))
      assertTrue(text(document, 2).contains("marigold"))
    }
    withPdf("columns.pdf") { document ->
      val content = text(document, 1)
      assertTrue(content.contains("LEFT column sentence 12"))
      assertTrue(content.contains("RIGHT column sentence 12"))
    }
  }
  @Test fun readsLargeDocumentsAndIdentifiesPageLimit() {
    withPdf("large.pdf") { document ->
      assertEquals(300, document.numberOfPages)
      assertTrue(text(document, 300).contains("PAGE_300"))
    }
    withPdf("page-limit.pdf") { assertEquals(301, it.numberOfPages) }
  }
  @Test fun distinguishesScansAndMixedPages() {
    withPdf("scanned.pdf") { assertTrue(text(it, 1).isBlank()) }
    withPdf("mixed.pdf") { document ->
      assertTrue(text(document, 1).isBlank())
      assertTrue(text(document, 2).contains("coriander"))
    }
  }
  @Test fun rejectsLockedAndCorruptDocuments() {
    try { withPdf("locked.pdf") { fail("Locked PDF opened without a password") }; fail("Expected password error") }
    catch (_: InvalidPasswordException) { }
    try { withPdf("corrupt.pdf") { fail("Corrupt PDF opened") }; fail("Expected parse error") }
    catch (_: java.io.IOException) { }
  }
}
