package com.llmhub

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.util.Base64
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.RandomAccessFile
import java.net.Inet4Address
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.concurrent.Executors
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/** Secrets never enter HTTP headers. Only bounded authenticated chunks cross the JS bridge. */
class ModelTransferFiles(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val worker = Executors.newSingleThreadExecutor()
  private val nsd = context.getSystemService(Context.NSD_SERVICE) as NsdManager
  private var registration: NsdManager.RegistrationListener? = null
  private var discovery: NsdManager.DiscoveryListener? = null
  private var multicast: WifiManager.MulticastLock? = null
  @Volatile private var discoveryEpoch = 0
  override fun getName() = "ModelTransferFiles"
  @ReactMethod fun addListener(name: String) {}
  @ReactMethod fun removeListeners(count: Double) {}
  private fun emit(name: String, value: WritableMap) = context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(name, value)
  private fun run(promise: Promise, task: () -> Any?) { worker.execute { try { promise.resolve(task()) } catch (e: Exception) { promise.reject("TRANSFER_FILES", e.message, e) } } }
  private fun digest(text: String) = MessageDigest.getInstance("SHA-256").digest(text.toByteArray(Charsets.UTF_8))
  private fun valid(secret: String) { require(secret.matches(Regex("[a-f0-9]{48}"))) { "Invalid pairing key" } }
  private fun authorization(secret: String): String { valid(secret); return digest("llmhub-transfer-auth-v1:$secret").take(24).joinToString("") { "%02x".format(it) } }
  private fun cipher(mode: Int, secret: String, nonce: ByteArray, aad: String): Cipher {
    valid(secret); require(aad.length <= 1024)
    return Cipher.getInstance("AES/GCM/NoPadding").apply {
      init(mode, SecretKeySpec(digest("llmhub-transfer-enc-v1:$secret"), "AES"), GCMParameterSpec(128, nonce))
      updateAAD(aad.toByteArray(Charsets.UTF_8))
    }
  }
  private fun seal(bytes: ByteArray, secret: String, aad: String): String {
    require(bytes.size <= 262144)
    val nonce = ByteArray(12).also { SecureRandom().nextBytes(it) }
    return Base64.encodeToString(nonce + cipher(Cipher.ENCRYPT_MODE, secret, nonce, aad).doFinal(bytes), Base64.NO_WRAP)
  }
  private fun open(text: String, secret: String, aad: String): ByteArray {
    require(text.length <= 349600 && text.matches(Regex("[A-Za-z0-9+/]*={0,2}")))
    val bytes = Base64.decode(text, Base64.NO_WRAP); require(bytes.size in 28..262172)
    return cipher(Cipher.DECRYPT_MODE, secret, bytes.copyOfRange(0,12), aad).doFinal(bytes.copyOfRange(12,bytes.size))
  }
  private fun offset(value: Double): Long { require(value >= 0 && value <= 9007199254740991.0 && value % 1.0 == 0.0); return value.toLong() }
  private fun file(path: String, incoming: Boolean): File {
    val root = File(context.filesDir, if (incoming) "incoming" else "models").canonicalFile
    val result = File(path).canonicalFile
    require(result.parentFile == root) { "File outside private transfer storage" }
    return result
  }
  @ReactMethod fun pairing(promise: Promise) = run(promise) {
    val secret = ByteArray(24).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }
    Arguments.createMap().apply { putString("secret", secret); putString("authorization", authorization(secret)) }
  }
  @ReactMethod fun auth(secret: String, promise: Promise) = run(promise) { authorization(secret) }
  @ReactMethod fun sealText(text: String, secret: String, aad: String, promise: Promise) = run(promise) { seal(text.toByteArray(Charsets.UTF_8), secret, aad) }
  @ReactMethod fun openText(text: String, secret: String, aad: String, promise: Promise) = run(promise) { String(open(text, secret, aad), Charsets.UTF_8) }
  @ReactMethod fun readChunk(path: String, start: Double, length: Double, secret: String, aad: String, promise: Promise) = run(promise) {
    val count = offset(length); require(count in 1L..262144L)
    RandomAccessFile(file(path, false), "r").use { handle ->
      val position = offset(start); require(position <= handle.length() - count)
      handle.seek(position); val bytes = ByteArray(count.toInt()); handle.readFully(bytes); seal(bytes, secret, aad)
    }
  }
  @ReactMethod fun writeChunk(path: String, start: Double, text: String, secret: String, aad: String, promise: Promise) = run(promise) {
    val bytes = open(text, secret, aad); require(bytes.isNotEmpty())
    RandomAccessFile(file(path, true), "rw").use { handle ->
      val position = offset(start); require(handle.length() == position) { "Resume offset mismatch" }
      handle.seek(position); handle.write(bytes); handle.fd.sync(); bytes.size
    }
  }
  @ReactMethod fun advertise(name: String, port: Double, promise: Promise) {
    try {
      stopAdvertising(); require(port % 1.0 == 0.0 && port in 1024.0..65535.0)
      val listener = object: NsdManager.RegistrationListener {
        override fun onServiceRegistered(info: NsdServiceInfo) {}
        override fun onServiceUnregistered(info: NsdServiceInfo) {}
        override fun onRegistrationFailed(info: NsdServiceInfo, code: Int) { emitError("Discovery unavailable. Use the displayed address and pairing key.") }
        override fun onUnregistrationFailed(info: NsdServiceInfo, code: Int) {}
      }
      registration = listener
      nsd.registerService(NsdServiceInfo().apply { serviceName = name.take(63); serviceType = "_llmhub-share._tcp."; setPort(port.toInt()) }, NsdManager.PROTOCOL_DNS_SD, listener)
      promise.resolve(null)
    } catch (e: Exception) { promise.reject("TRANSFER_ADVERTISE", e.message, e) }
  }
  private fun emitError(message: String) = emit("TransferDiscoveryError", Arguments.createMap().apply { putString("message", message) })
  @ReactMethod fun discover(promise: Promise) {
    try {
      stopDiscovery(); val epoch = discoveryEpoch
      multicast = (context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager).createMulticastLock("llmhub-transfer").apply { setReferenceCounted(false); acquire() }
      val listener = object: NsdManager.DiscoveryListener {
        override fun onDiscoveryStarted(type: String) {}
        override fun onDiscoveryStopped(type: String) {}
        override fun onStartDiscoveryFailed(type: String, code: Int) { emitError("Discovery unavailable. Enter the sender's address manually.") }
        override fun onStopDiscoveryFailed(type: String, code: Int) {}
        override fun onServiceLost(info: NsdServiceInfo) { if (epoch == discoveryEpoch) emit("TransferPeerLost", Arguments.createMap().apply { putString("id", info.serviceName) }) }
        override fun onServiceFound(info: NsdServiceInfo) {
          if (epoch != discoveryEpoch) return
          @Suppress("DEPRECATION")
          nsd.resolveService(info, object: NsdManager.ResolveListener {
            override fun onResolveFailed(info: NsdServiceInfo, code: Int) {}
            override fun onServiceResolved(resolved: NsdServiceInfo) {
              if (epoch != discoveryEpoch || resolved.host !is Inet4Address) return
              emit("TransferPeer", Arguments.createMap().apply { putString("id", resolved.serviceName); putString("name", resolved.serviceName); putString("url", "http://${resolved.host.hostAddress}:${resolved.port}") })
            }
          })
        }
      }
      discovery = listener; nsd.discoverServices("_llmhub-share._tcp.", NsdManager.PROTOCOL_DNS_SD, listener); promise.resolve(null)
    } catch (e: Exception) { stopDiscovery(); promise.reject("TRANSFER_DISCOVERY", e.message, e) }
  }
  private fun stopAdvertising() { registration?.let { runCatching { nsd.unregisterService(it) } }; registration = null }
  private fun stopDiscovery() { discoveryEpoch++; discovery?.let { runCatching { nsd.stopServiceDiscovery(it) } }; discovery = null; multicast?.let { runCatching { it.release() } }; multicast = null }
  @ReactMethod fun stopNearby(promise: Promise) { stopAdvertising(); stopDiscovery(); promise.resolve(null) }
  override fun invalidate() { stopAdvertising(); stopDiscovery(); worker.shutdown(); super.invalidate() }
}
