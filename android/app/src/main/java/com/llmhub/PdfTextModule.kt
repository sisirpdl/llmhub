package com.llmhub

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.ViewManager
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.io.MemoryUsageSetting
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.encryption.InvalidPasswordException
import com.tom_roush.pdfbox.text.PDFTextStripper
import java.io.File
import java.util.concurrent.Executors

/** File IO and extraction never run on the UI thread. All session access is serialized. */
@ReactModule(name = PdfTextModule.NAME)
class PdfTextModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  companion object { const val NAME = "PdfText" }
  private val worker = Executors.newSingleThreadExecutor()
  private val documents = mutableMapOf<String, PDDocument>()
  override fun getName() = NAME

  @ReactMethod
  fun open(id: String, path: String, promise: Promise) {
    worker.execute {
      var document: PDDocument? = null
      try {
        check(documents.isEmpty()) { "Another PDF is being imported." }
        val file = File(path).canonicalFile
        val roots = listOf(reactApplicationContext.filesDir, reactApplicationContext.cacheDir)
        require(roots.any { file.path.startsWith(it.canonicalPath + File.separator) }) { "Choose a local PDF." }
        require(file.length() in 1..(50L * 1024 * 1024)) { "PDFs must be smaller than 50 MB." }
        PDFBoxResourceLoader.init(reactApplicationContext)
        val memory = MemoryUsageSetting.setupMixed(8L * 1024 * 1024, 64L * 1024 * 1024)
        memory.setTempDir(reactApplicationContext.cacheDir)
        val opened = PDDocument.load(file, memory)
        document = opened
        require(!opened.isEncrypted) { "Password-protected PDFs are not supported. Import an unlocked copy." }
        require(opened.currentAccessPermission.canExtractContent()) { "This PDF does not permit text extraction." }
        require(opened.numberOfPages in 1..300) { "PDFs must contain between 1 and 300 pages." }
        documents[id] = opened
        promise.resolve(opened.numberOfPages)
      } catch (error: Exception) {
        runCatching { document?.close() }
        val message = if (error is InvalidPasswordException) "Password-protected PDFs are not supported. Import an unlocked copy."
          else error.message ?: "This PDF could not be read."
        promise.reject("PDF_OPEN_FAILED", message, error)
      }
    }
  }

  @ReactMethod
  fun page(id: String, index: Double, promise: Promise) {
    worker.execute {
      try {
        val document = documents[id] ?: error("PDF import session has ended.")
        require(index == index.toInt().toDouble() && index >= 0 && index < document.numberOfPages)
        val stripper = PDFTextStripper()
        stripper.startPage = index.toInt() + 1
        stripper.endPage = index.toInt() + 1
        // Preserve content-stream reading order; sorting by coordinates scrambles some columns.
        stripper.sortByPosition = false
        val text = stripper.getText(document)
        require(text.length <= 250000) { "A PDF page contains too much text." }
        promise.resolve(text)
      } catch (error: Exception) {
        promise.reject("PDF_TEXT_FAILED", error.message ?: "A PDF page could not be read.", error)
      }
    }
  }

  @ReactMethod
  fun close(id: String, promise: Promise) {
    worker.execute {
      try {
        documents.remove(id)?.close()
        promise.resolve(null)
      } catch (error: Exception) { promise.reject("PDF_CLOSE_FAILED", error) }
    }
  }

  override fun invalidate() {
    worker.execute { documents.values.forEach { runCatching { it.close() } }; documents.clear() }
    worker.shutdown()
    super.invalidate()
  }
}

class PdfTextPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(PdfTextModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
