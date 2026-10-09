package com.llmhub

import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.*
import com.journeyapps.barcodescanner.ScanOptions
import com.journeyapps.barcodescanner.ScanIntentResult

/** Bundled QR decoder: no external scanner app, network service, or image export. */
class NearbyQrScanner(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context), ActivityEventListener {
  private var pending: Promise? = null
  private val requestCode = 61024
  init { context.addActivityEventListener(this) }
  override fun getName() = "NearbyQrScanner"
  @ReactMethod fun scan(promise: Promise) {
    val activity = context.currentActivity
    if (activity == null) { promise.reject("QR_ACTIVITY", "Open LLMHub before scanning."); return }
    activity.runOnUiThread {
      if (pending != null) { promise.reject("QR_BUSY", "A scan is already open."); return@runOnUiThread }
      try {
        pending = promise
        val options = ScanOptions().setDesiredBarcodeFormats(ScanOptions.QR_CODE)
          .setPrompt("Scan the sender's LLMHub pairing QR code")
          .setBeepEnabled(false).setBarcodeImageEnabled(false).setOrientationLocked(false)
        activity.startActivityForResult(options.createScanIntent(activity), requestCode)
      } catch (error: Exception) { pending = null; promise.reject("QR_CAMERA", "Unable to open the scanner. Check camera permission or use manual pairing.", error) }
    }
  }
  override fun onActivityResult(activity: Activity, code: Int, resultCode: Int, data: Intent?) {
    if (code != requestCode) return
    val promise = pending ?: return; pending = null
    val result = ScanIntentResult.parseActivityResult(resultCode, data)
    promise.resolve(result.contents)
  }
  override fun onNewIntent(intent: Intent) {}
  override fun invalidate() { pending?.reject("QR_CLOSED", "Scanner closed."); pending = null; context.removeActivityEventListener(this); super.invalidate() }
}
