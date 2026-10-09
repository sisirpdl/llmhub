package com.llmhub

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.ViewManager
import java.net.*
import java.io.*
import java.security.SecureRandom
import java.util.concurrent.*

/** Small bounded HTTP/1.1 transport. Inference remains in the JS-owned llama context. */
class LanHttpModule(context: ReactApplicationContext, private val moduleName: String = "LanHttp") : ReactContextBaseJavaModule(context) {
  private val workers = Executors.newCachedThreadPool()
  private val timers = ScheduledThreadPoolExecutor(1).apply { setRemoveOnCancelPolicy(true) }
  @Volatile private var server: ServerSocket? = null
  private val peers = ConcurrentHashMap<String, Socket>()
  private val clients = ConcurrentHashMap<String, Socket>()
  @Volatile private var key = ""
  override fun getName() = moduleName
  private fun emit(name: String, value: WritableMap) {
    reactApplicationContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(if (moduleName == "LanHttp") name else name.replace("Lan", "ModelTransfer"), value)
  }
  private fun privateIp(ip: String): Boolean {
    val p = ip.split('.').map { it.toIntOrNull() ?: -1 }
    return p.size == 4 && p.all { it in 0..255 } && (p[0] == 10 || p[0] == 127 || (p[0] == 192 && p[1] == 168) || (p[0] == 172 && p[1] in 16..31))
  }
  private fun line(input: InputStream): String {
    val bytes = ByteArrayOutputStream()
    while (true) {
      val byte = input.read()
      if (byte < 0) throw EOFException()
      if (byte == 10) break
      if (bytes.size() >= 8192) throw IOException("HTTP header too large")
      if (byte != 13) bytes.write(byte)
    }
    return bytes.toString("UTF-8")
  }
  private fun read(input: InputStream): Triple<String, Map<String,String>, String> {
    val first = line(input)
    val headers = mutableMapOf<String,String>()
    var size = first.length
    while (true) {
      val header = line(input)
      size += header.length
      require(size < 16384) { "HTTP headers too large" }
      if (header.isEmpty()) break
      val pair = header.split(':', limit = 2)
      require(pair.size == 2)
      val name = pair[0].lowercase()
      require(!headers.containsKey(name)) { "Duplicate HTTP header" }
      headers[name] = pair[1].trim()
    }
    require(!headers.containsKey("transfer-encoding")) { "Chunked requests are not supported" }
    val length = headers["content-length"]?.let { it.toIntOrNull() ?: error("Invalid content length") } ?: 0
    require(length in 0..1048576) { "HTTP body exceeds 1 MiB" }
    val body = ByteArray(length)
    var offset = 0
    while (offset < length) { val n = input.read(body, offset, length-offset); if (n < 0) throw EOFException(); offset += n }
    return Triple(first, headers, String(body, Charsets.UTF_8))
  }
  private fun reply(socket: Socket, status: Int, body: String) {
    val bytes = body.toByteArray(Charsets.UTF_8)
    val out = socket.getOutputStream()
    out.write("HTTP/1.1 $status Response\r\nContent-Type: application/json\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n".toByteArray())
    out.write(bytes); out.flush()
  }
  @ReactMethod fun addListener(name: String) { }
  @ReactMethod fun removeListeners(count: Double) { }
  @ReactMethod fun start(port: Double, promise: Promise) = startServer(port, null, promise)
  @ReactMethod fun startWithAuthorization(port: Double, authorization: String, promise: Promise) {
    if (moduleName != "ModelTransferHttp" || !authorization.matches(Regex("[a-f0-9]{48}"))) { promise.reject("TRANSFER_KEY", "Invalid transfer authorization"); return }
    startServer(port, authorization, promise)
  }
  private fun startServer(port: Double, authorization: String?, promise: Promise) {
    workers.execute {
      var started = false
      var listenerRef: ServerSocket? = null
      var sessionId = ""
      try {
        require(server == null) { "Already hosting" }
        require(port == port.toInt().toDouble() && port in 1024.0..65535.0)
        val address = NetworkInterface.getNetworkInterfaces().toList().filter { it.isUp && (it.name.startsWith("wlan") || it.name.startsWith("wifi")) }
          .flatMap { it.inetAddresses.toList() }.firstOrNull { it is Inet4Address && privateIp(it.hostAddress ?: "") }
          ?: error("Connect this phone to Wi-Fi before hosting.")
        val listener = ServerSocket().apply { reuseAddress = true; bind(InetSocketAddress(address, port.toInt()), 4) }
        val bytes = ByteArray(24); SecureRandom().nextBytes(bytes)
        key = authorization ?: bytes.joinToString("") { "%02x".format(it) }
        server = listener
        listenerRef = listener
        val sessionKey = key
        sessionId = java.util.UUID.randomUUID().toString()
        started = true
        promise.resolve(Arguments.createMap().apply {putString("url", "http://${address.hostAddress}:${listener.localPort}");putString("token", key);putString("session", sessionId)})
        while (!listener.isClosed) {
          val socket = listener.accept()
          if (peers.size >= 4) { socket.close(); continue }
          val id = java.util.UUID.randomUUID().toString()
          peers[id] = socket
          workers.execute connection@ {
            var deadline: ScheduledFuture<*> = timers.schedule(Runnable { runCatching { socket.close() } }, 10, TimeUnit.SECONDS)
            try {
              socket.soTimeout = 10000
              val input = BufferedInputStream(socket.getInputStream())
              val (first, headers, body) = read(input)
              deadline.cancel(false)
              val parts = first.split(' ')
              require(parts.size == 3 && parts[2] == "HTTP/1.1")
              if (headers["authorization"] != "Bearer $sessionKey") {reply(socket,401,"{\"error\":{\"message\":\"Access key required\"}}");peers.remove(id);socket.close();return@connection}
              emit("LanRequest", Arguments.createMap().apply {putString("id",id);putString("session",sessionId);putString("method",parts[0]);putString("path",parts[1]);putString("body",body)})
              // Bound inference lifetime even if JS no longer handles requests.
              deadline = timers.schedule(Runnable { peers.remove(id)?.let { runCatching { it.close() }; emit("LanCancelled", Arguments.createMap().apply { putString("id", id) }) } }, 180, TimeUnit.SECONDS)
              socket.soTimeout = 180000
              input.read() // EOF when the requesting device cancels/disconnects.
              if (peers.remove(id) != null) {
                emit("LanCancelled", Arguments.createMap().apply { putString("id", id) })
                socket.close()
              }
            } catch (_: Exception) {
              if (peers.remove(id) != null) {
                emit("LanCancelled", Arguments.createMap().apply { putString("id", id) })
                runCatching { socket.close() }
              }
            } finally { deadline.cancel(false) }
          }
        }
      } catch (error: Exception) {
        if (!started) promise.reject("LAN_START", error.message, error)
        else if (server === listenerRef) {server = null; emit("LanStopped", Arguments.createMap().apply { putString("session", sessionId) })}
        runCatching { listenerRef?.close() }
      }
    }
  }
  @ReactMethod fun respond(id: String, status: Double, body: String, promise: Promise) {
    workers.execute {val socket = peers.remove(id); try {if (socket != null) reply(socket,status.toInt(),body);promise.resolve(null)}
      catch (error: Exception) {promise.reject("LAN_RESPONSE",error)} finally {socket?.close()} }
  }
  @ReactMethod fun stop(promise: Promise) {
    val old = server; server = null; key = ""; runCatching {old?.close()}
    peers.values.forEach {runCatching {it.close()}};peers.clear();promise.resolve(null)
  }
  @ReactMethod fun request(id: String, url: String, token: String, method: String, body: String, promise: Promise) {
    val socket = Socket();clients[id] = socket
    workers.execute {
      val deadline = timers.schedule(Runnable { runCatching { socket.close() } }, 180, TimeUnit.SECONDS)
      try {
        val uri = URI(url)
        require(uri.scheme == "http" && privateIp(uri.host ?: "") && uri.userInfo == null && uri.port in 1024..65535 && (method == "GET" || method == "POST")) {"Use a private IPv4 LAN address and port."}
        require(token.matches(Regex("[a-f0-9]{48}"))) {"Invalid access key"}
        val bytes = body.toByteArray(Charsets.UTF_8);require(bytes.size <= 1048576)
        socket.connect(InetSocketAddress(uri.host,uri.port),5000);socket.soTimeout = 180000
        val out = socket.getOutputStream()
        out.write("$method ${uri.rawPath} HTTP/1.1\r\nHost: ${uri.host}:${uri.port}\r\nAuthorization: Bearer $token\r\nContent-Type: application/json\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n".toByteArray())
        out.write(bytes);out.flush()
        val (first, _, response) = read(BufferedInputStream(socket.getInputStream()))
        promise.resolve(Arguments.createMap().apply {putInt("status",first.split(' ')[1].toInt());putString("body",response)})
      } catch (error: Exception) {promise.reject("LAN_REQUEST", "LAN request failed. Check Wi-Fi, address, access key, and that the host is open.", error)}
      finally {deadline.cancel(false);clients.remove(id);socket.close()}
    }
  }
  @ReactMethod fun cancel(id: String) {runCatching {clients.remove(id)?.close()}}
  override fun invalidate() {runCatching {server?.close()};peers.values.forEach {runCatching {it.close()}};clients.values.forEach {runCatching {it.close()}};workers.shutdownNow();timers.shutdownNow();super.invalidate()}
}
class LanHttpPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(LanHttpModule(context), LanHttpModule(context, "ModelTransferHttp"), ModelTransferFiles(context), NearbyQrScanner(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
