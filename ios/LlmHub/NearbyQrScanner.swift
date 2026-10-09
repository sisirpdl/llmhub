import AVFoundation
import UIKit
import React

private final class PairingScannerController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
  private let session = AVCaptureSession()
  private let worker = DispatchQueue(label: "llmhub.qr.camera")
  private var preview: AVCaptureVideoPreviewLayer?
  private var finished = false
  var completion: ((String?, Error?) -> Void)?
  override func viewDidLoad() {
    super.viewDidLoad(); view.backgroundColor = .black
    let title = UILabel(); title.text = "Scan the sender’s LLMHub pairing code"; title.textColor = .white; title.textAlignment = .center; title.numberOfLines = 2; title.translatesAutoresizingMaskIntoConstraints = false
    let cancel = UIButton(type: .system); cancel.setTitle("Cancel", for: .normal); cancel.tintColor = .white; cancel.translatesAutoresizingMaskIntoConstraints = false; cancel.addTarget(self, action: #selector(cancelScan), for: .touchUpInside)
    view.addSubview(title); view.addSubview(cancel)
    NSLayoutConstraint.activate([title.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 24), title.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24), title.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24), cancel.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24), cancel.centerXAnchor.constraint(equalTo: view.centerXAnchor), cancel.heightAnchor.constraint(greaterThanOrEqualToConstant: 48), cancel.widthAnchor.constraint(greaterThanOrEqualToConstant: 100)])
    let layer = AVCaptureVideoPreviewLayer(session: session); layer.videoGravity = .resizeAspectFill; view.layer.insertSublayer(layer, at: 0); preview = layer
    NotificationCenter.default.addObserver(self, selector: #selector(cancelScan), name: UIApplication.didEnterBackgroundNotification, object: nil)
    worker.async { [weak self] in
      guard let self = self else { return }
      do {
        guard let camera = AVCaptureDevice.default(for: .video) else { throw NSError(domain: "PairingQR", code: 1, userInfo: [NSLocalizedDescriptionKey: "No camera available. Use manual pairing."]) }
        let input = try AVCaptureDeviceInput(device: camera), output = AVCaptureMetadataOutput()
        self.session.beginConfiguration()
        guard self.session.canAddInput(input), self.session.canAddOutput(output) else { self.session.commitConfiguration(); throw NSError(domain: "PairingQR", code: 2, userInfo: [NSLocalizedDescriptionKey: "Unable to start the camera. Use manual pairing."]) }
        self.session.addInput(input); self.session.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: .main); output.metadataObjectTypes = [.qr]
        self.session.commitConfiguration(); self.session.startRunning()
      } catch { DispatchQueue.main.async { self.finish(nil, error) } }
    }
  }
  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews(); preview?.frame = view.bounds
    if let connection = preview?.connection, connection.isVideoOrientationSupported {
      switch view.window?.windowScene?.interfaceOrientation {
      case .landscapeLeft: connection.videoOrientation = .landscapeLeft
      case .landscapeRight: connection.videoOrientation = .landscapeRight
      case .portraitUpsideDown: connection.videoOrientation = .portraitUpsideDown
      default: connection.videoOrientation = .portrait
      }
    }
  }
  override func viewDidDisappear(_ animated: Bool) { super.viewDidDisappear(animated); finish(nil, nil) }
  @objc private func cancelScan() { finish(nil, nil) }
  func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput objects: [AVMetadataObject], from connection: AVCaptureConnection) {
    if let code = objects.compactMap({ $0 as? AVMetadataMachineReadableCodeObject }).first(where: { $0.type == .qr }), let text = code.stringValue { finish(text, nil) }
  }
  private func finish(_ value: String?, _ error: Error?) {
    guard !finished else { return }; finished = true; NotificationCenter.default.removeObserver(self)
    let callback = completion; completion = nil
    worker.async { [session] in if session.isRunning { session.stopRunning() } }
    if presentingViewController != nil { dismiss(animated: true) { callback?(value, error) } }
    else { callback?(value, error) }
  }
  deinit { NotificationCenter.default.removeObserver(self) }
}

@objc(NearbyQrScanner)
class NearbyQrScanner: NSObject, RCTBridgeModule {
  static func moduleName() -> String! { "NearbyQrScanner" }
  static func requiresMainQueueSetup() -> Bool { true }
  private var pending = false
  private weak var scanner: PairingScannerController?
  @objc func scan(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      guard !self.pending else { reject("QR_BUSY", "A scan is already open.", nil); return }
      self.pending = true
      let open: (Bool) -> Void = { allowed in DispatchQueue.main.async {
        guard allowed else { self.pending = false; reject("QR_PERMISSION", "Allow camera access in Settings, or use manual pairing.", nil); return }
        self.presentScanner(resolve, reject, attempts: 20)
      } }
      switch AVCaptureDevice.authorizationStatus(for: .video) {
      case .authorized: open(true)
      case .notDetermined: AVCaptureDevice.requestAccess(for: .video, completionHandler: open)
      default: open(false)
      }
    }
  }
  private func presentScanner(_ resolve: @escaping RCTPromiseResolveBlock, _ reject: @escaping RCTPromiseRejectBlock, attempts: Int) {
    // The permission callback may arrive while its system dialog is still closing.
    if UIApplication.shared.applicationState == .inactive && attempts > 0 {
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { self.presentScanner(resolve, reject, attempts: attempts - 1) }
      return
    }
    guard UIApplication.shared.applicationState == .active, let presenter = RCTPresentedViewController() else { self.pending = false; reject("QR_ACTIVITY", "Return to LLMHub before scanning.", nil); return }
    let scanner = PairingScannerController(); scanner.modalPresentationStyle = .fullScreen
    scanner.completion = { [weak self] value, error in
      self?.pending = false
      if let error = error { reject("QR_CAMERA", error.localizedDescription, error) } else { resolve(value) }
    }
    self.scanner = scanner; presenter.present(scanner, animated: true)
  }

}
