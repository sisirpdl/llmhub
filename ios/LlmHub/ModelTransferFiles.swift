import Foundation
import Darwin
import CryptoKit
import Security
import React

@objc(ModelTransferFiles)
class ModelTransferFiles: RCTEventEmitter, NetServiceBrowserDelegate, NetServiceDelegate {
  private let worker = DispatchQueue(label: "llmhub.transfer.files")
  private var browser: NetServiceBrowser?
  private var advertisement: NetService?
  private var resolving: [String: NetService] = [:]
  override static func requiresMainQueueSetup() -> Bool { true }
  override func supportedEvents() -> [String]! { ["TransferPeer", "TransferPeerLost", "TransferDiscoveryError"] }
  private func fail(_ message: String) -> NSError { NSError(domain: "ModelTransfer", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
  private func run(_ resolve: @escaping RCTPromiseResolveBlock, _ reject: @escaping RCTPromiseRejectBlock, _ task: @escaping () throws -> Any?) {
    worker.async { do { resolve(try task()) } catch { reject("TRANSFER_FILES", error.localizedDescription, error) } }
  }
  private func valid(_ secret: String) throws {
    guard secret.range(of: "^[a-f0-9]{48}$", options: .regularExpression) != nil else { throw fail("Invalid pairing key") }
  }
  private func authorization(_ secret: String) throws -> String {
    try valid(secret)
    return SHA256.hash(data: Data("llmhub-transfer-auth-v1:\(secret)".utf8)).prefix(24).map { String(format: "%02x", $0) }.joined()
  }
  private func key(_ secret: String) throws -> SymmetricKey {
    try valid(secret)
    return SymmetricKey(data: SHA256.hash(data: Data("llmhub-transfer-enc-v1:\(secret)".utf8)))
  }
  private func seal(_ bytes: Data, _ secret: String, _ aad: String) throws -> String {
    guard bytes.count <= 262144, aad.utf8.count <= 1024 else { throw fail("Chunk too large") }
    guard let combined = try AES.GCM.seal(bytes, using: key(secret), authenticating: Data(aad.utf8)).combined else { throw fail("Encryption failed") }
    return combined.base64EncodedString()
  }
  private func open(_ text: String, _ secret: String, _ aad: String) throws -> Data {
    guard text.utf8.count <= 349600, aad.utf8.count <= 1024, let bytes = Data(base64Encoded: text), (28...262172).contains(bytes.count) else { throw fail("Invalid encrypted chunk") }
    return try AES.GCM.open(AES.GCM.SealedBox(combined: bytes), using: key(secret), authenticating: Data(aad.utf8))
  }
  private func offset(_ value: Double) throws -> UInt64 {
    guard value.isFinite, value >= 0, value <= 9007199254740991, value.rounded(.down) == value else { throw fail("Invalid file offset") }
    return UInt64(value)
  }
  private func file(_ path: String, incoming: Bool) throws -> URL {
    let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    let root = documents.appendingPathComponent(incoming ? "incoming" : "models").resolvingSymlinksInPath().standardizedFileURL
    let result = URL(fileURLWithPath: path).resolvingSymlinksInPath().standardizedFileURL
    guard result.deletingLastPathComponent().path == root.path else { throw fail("File outside private transfer storage") }
    return result
  }
  @objc func pairing(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      var bytes = [UInt8](repeating: 0, count: 24)
      guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw self.fail("Secure random unavailable") }
      let secret = bytes.map { String(format: "%02x", $0) }.joined()
      return ["secret": secret, "authorization": try self.authorization(secret)]
    }
  }
  @objc func auth(_ secret: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) { try self.authorization(secret) }
  }
  @objc func sealText(_ text: String, secret: String, aad: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) { try self.seal(Data(text.utf8), secret, aad) }
  }
  @objc func openText(_ text: String, secret: String, aad: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      guard let value = String(data: try self.open(text, secret, aad), encoding: .utf8) else { throw self.fail("Invalid text") }
      return value
    }
  }
  @objc func readChunk(_ path: String, start: Double, length: Double, secret: String, aad: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      let count = try self.offset(length), position = try self.offset(start)
      guard (1...262144).contains(count) else { throw self.fail("Invalid chunk length") }
      let handle = try FileHandle(forReadingFrom: self.file(path, incoming: false)); defer { try? handle.close() }
      let size = try handle.seekToEnd()
      guard size >= count, position <= size - count else { throw self.fail("File truncated") }
      try handle.seek(toOffset: position)
      guard let bytes = try handle.read(upToCount: Int(count)), bytes.count == Int(count) else { throw self.fail("File truncated") }
      return try self.seal(bytes, secret, aad)
    }
  }
  @objc func writeChunk(_ path: String, start: Double, text: String, secret: String, aad: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      let bytes = try self.open(text, secret, aad), position = try self.offset(start)
      guard !bytes.isEmpty else { throw self.fail("Empty chunk") }
      let url = try self.file(path, incoming: true)
      if !FileManager.default.fileExists(atPath: url.path) { guard FileManager.default.createFile(atPath: url.path, contents: nil) else { throw self.fail("Cannot create incoming file") } }
      let handle = try FileHandle(forWritingTo: url); defer { try? handle.close() }
      guard try handle.seekToEnd() == position else { throw self.fail("Resume offset mismatch") }
      try handle.write(contentsOf: bytes); try handle.synchronize(); return bytes.count
    }
  }
  @objc func advertise(_ name: String, port: Double, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      guard port.isFinite, port.rounded() == port, (1024...65535).contains(port) else { reject("TRANSFER_ADVERTISE", "Invalid port", nil); return }
      self.advertisement?.stop()
      let service = NetService(domain: "local.", type: "_llmhub-share._tcp.", name: String(name.prefix(63)), port: Int32(port))
      service.delegate = self; self.advertisement = service; service.publish(); resolve(nil)
    }
  }
  @objc func discover(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      self.stopDiscovery()
      let browser = NetServiceBrowser(); browser.delegate = self; self.browser = browser
      browser.searchForServices(ofType: "_llmhub-share._tcp.", inDomain: "local."); resolve(nil)
    }
  }
  private func stopDiscovery() { browser?.stop(); browser = nil; resolving.values.forEach { $0.stop() }; resolving.removeAll() }
  @objc func stopNearby(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async { self.stopDiscovery(); self.advertisement?.stop(); self.advertisement = nil; resolve(nil) }
  }
  func netServiceBrowser(_ browser: NetServiceBrowser, didFind service: NetService, moreComing: Bool) {
    guard browser === self.browser else { return }
    resolving[service.name] = service; service.delegate = self; service.resolve(withTimeout: 5)
  }
  func netServiceBrowser(_ browser: NetServiceBrowser, didRemove service: NetService, moreComing: Bool) {
    guard browser === self.browser else { return }
    resolving.removeValue(forKey: service.name)?.stop(); sendEvent(withName: "TransferPeerLost", body: ["id": service.name])
  }
  func netServiceDidResolveAddress(_ service: NetService) {
    guard resolving[service.name] === service else { return }
    for data in service.addresses ?? [] {
      let ip: String? = data.withUnsafeBytes { raw in
        guard raw.count >= MemoryLayout<sockaddr_in>.size, let base = raw.baseAddress else { return nil }
        let address = base.assumingMemoryBound(to: sockaddr.self)
        guard address.pointee.sa_family == sa_family_t(AF_INET) else { return nil }
        var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
        guard getnameinfo(address, socklen_t(raw.count), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 else { return nil }
        return String(cString: host)
      }
      if let ip = ip { sendEvent(withName: "TransferPeer", body: ["id": service.name, "name": service.name, "url": "http://\(ip):\(service.port)"]); break }
    }
  }
  func netServiceBrowser(_ browser: NetServiceBrowser, didNotSearch errorDict: [String: NSNumber]) {
    sendEvent(withName: "TransferDiscoveryError", body: ["message": "Discovery unavailable. Enter the sender's address manually."])
  }
  func netService(_ sender: NetService, didNotPublish errorDict: [String: NSNumber]) {
    sendEvent(withName: "TransferDiscoveryError", body: ["message": "Discovery unavailable. Use the displayed address and pairing key."])
  }
  override func invalidate() { DispatchQueue.main.async { self.stopDiscovery(); self.advertisement?.stop(); self.advertisement = nil }; super.invalidate() }
}
