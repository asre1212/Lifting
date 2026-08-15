import UIKit
import WebKit

/// Hosts the LiftTrack web app full screen and wires it to native services.
final class WebViewController: UIViewController {

    private static let backgroundColor = UIColor(red: 0x0D / 255, green: 0x0D / 255, blue: 0x0D / 255, alpha: 1)

    private var webView: WKWebView!

    // MARK: - Lifecycle

    override func loadView() {
        let container = UIView()
        container.backgroundColor = Self.backgroundColor
        view = container
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        buildWebView()
        loadApp()
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override var prefersHomeIndicatorAutoHidden: Bool { false }

    // MARK: - Setup

    private func buildWebView() {
        let controller = WKUserContentController()
        controller.add(self, name: Channel.store)
        controller.add(self, name: Channel.share)
        controller.add(self, name: Channel.haptics)
        controller.addUserScript(makeBridgeScript())

        let configuration = WKWebViewConfiguration()
        configuration.userContentController = controller
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.suppressesIncrementalRendering = false

        webView = WKWebView(frame: view.bounds, configuration: configuration)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.isOpaque = false
        webView.backgroundColor = Self.backgroundColor
        webView.allowsLinkPreview = false
        webView.allowsBackForwardNavigationGestures = false
        webView.navigationDelegate = self

        // The page already ships `viewport-fit=cover` and its own safe-area
        // padding, so pin to the full screen and let CSS do the insetting.
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.backgroundColor = Self.backgroundColor
        webView.scrollView.pinchGestureRecognizer?.isEnabled = false

        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
    }

    /// Bridge.js, prefixed with the current store so the page's very first
    /// synchronous `localStorage.getItem` already has real data to read.
    private func makeBridgeScript() -> WKUserScript {
        var source = "window.__LT_SEED__ = \(Self.jsonObjectLiteral(Storage.shared.snapshot));\n"

        if let url = Bundle.main.url(forResource: "Bridge", withExtension: "js"),
           let bridge = try? String(contentsOf: url, encoding: .utf8) {
            source += bridge
        } else {
            NSLog("[LiftTrack] Bridge.js missing from bundle — storage and export will not work")
        }

        return WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    }

    private func loadApp() {
        guard let index = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "www") else {
            showFatal("The bundled web app is missing. Check the “Copy Web App” build phase.")
            return
        }
        webView.loadFileURL(index, allowingReadAccessTo: index.deletingLastPathComponent())
    }

    // MARK: - Failure surface

    private func showFatal(_ message: String) {
        let label = UILabel()
        label.text = message
        label.textColor = .white
        label.numberOfLines = 0
        label.textAlignment = .center
        label.font = .systemFont(ofSize: 15)
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 32),
            label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -32),
        ])
    }

    // MARK: - JS helpers

    private static func jsonObjectLiteral(_ dictionary: [String: String]) -> String {
        guard let raw = try? JSONSerialization.data(withJSONObject: dictionary),
              let text = String(data: raw, encoding: .utf8) else { return "{}" }
        return text
    }

    private static func jsStringLiteral(_ value: String) -> String {
        guard let raw = try? JSONSerialization.data(withJSONObject: [value]),
              let text = String(data: raw, encoding: .utf8) else { return "\"\"" }
        return String(text.dropFirst().dropLast()) // unwrap the array brackets
    }
}

// MARK: - Native channels

private enum Channel {
    static let store = "store"
    static let share = "share"
    static let haptics = "haptics"
}

extension WebViewController: WKScriptMessageHandler {

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        switch message.name {
        case Channel.store:   handleStore(message.body)
        case Channel.share:   handleShare(message.body)
        case Channel.haptics: handleHaptics(message.body)
        default:              break
        }
    }

    // MARK: Storage

    private func handleStore(_ body: Any) {
        guard let payload = body as? [String: Any], let op = payload["op"] as? String else { return }

        switch op {
        case "set":
            guard let key = payload["key"] as? String, let value = payload["value"] as? String else { return }
            Storage.shared.set(key, value)
        case "remove":
            guard let key = payload["key"] as? String else { return }
            Storage.shared.remove(key)
        case "clear":
            Storage.shared.clear()
        default:
            break
        }
    }

    // MARK: Share / export

    private func handleShare(_ body: Any) {
        guard let payload = body as? [String: Any], let id = payload["id"] as? Int else { return }

        var items: [Any] = []
        var temporaryFiles: [URL] = []

        if let files = payload["files"] as? [[String: Any]], !files.isEmpty {
            let directory = FileManager.default.temporaryDirectory
                .appendingPathComponent("share-\(UUID().uuidString)", isDirectory: true)
            do {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            } catch {
                resolveShare(id, ok: false, name: "InvalidStateError", message: error.localizedDescription)
                return
            }

            for file in files {
                guard let name = file["name"] as? String,
                      let base64 = file["data"] as? String,
                      let decoded = Data(base64Encoded: base64) else { continue }

                let url = directory.appendingPathComponent(name.isEmpty ? "LiftTrack" : name)
                do {
                    try decoded.write(to: url, options: .atomic)
                    items.append(url)
                    temporaryFiles.append(url)
                } catch {
                    NSLog("[LiftTrack] could not stage share file: \(error.localizedDescription)")
                }
            }
        }

        if let text = payload["text"] as? String, !text.isEmpty { items.append(text) }
        if let link = payload["url"] as? String, !link.isEmpty, let url = URL(string: link) { items.append(url) }

        guard !items.isEmpty else {
            resolveShare(id, ok: false, name: "DataError", message: "Nothing to share")
            return
        }

        let activity = UIActivityViewController(activityItems: items, applicationActivities: nil)
        activity.completionWithItemsHandler = { [weak self] _, completed, _, error in
            // Some activities copy the file asynchronously after reporting
            // completion, so give them a grace period before cleaning up.
            DispatchQueue.main.asyncAfter(deadline: .now() + 30) {
                for url in temporaryFiles { try? FileManager.default.removeItem(at: url) }
            }

            if let error {
                self?.resolveShare(id, ok: false, name: "AbortError", message: error.localizedDescription)
            } else if completed {
                self?.resolveShare(id, ok: true)
            } else {
                self?.resolveShare(id, ok: false, name: "AbortError", message: "Share cancelled")
            }
        }

        if let popover = activity.popoverPresentationController {
            popover.sourceView = view
            popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.maxY - 60, width: 1, height: 1)
            popover.permittedArrowDirections = []
        }

        present(activity, animated: true)
    }

    private func resolveShare(_ id: Int, ok: Bool, name: String = "", message: String = "") {
        let script = """
        window.__ltShareResult(\(id), \(ok), \
        \(Self.jsStringLiteral(name)), \(Self.jsStringLiteral(message)));
        """
        webView.evaluateJavaScript(script) { _, error in
            if let error { NSLog("[LiftTrack] share callback failed: \(error.localizedDescription)") }
        }
    }

    // MARK: Haptics

    private func handleHaptics(_ body: Any) {
        guard let payload = body as? [String: Any] else { return }
        let pattern = (payload["pattern"] as? [Any])?.compactMap { ($0 as? NSNumber)?.doubleValue } ?? []

        // index.html uses a multi-pulse pattern for "rest over" and single
        // pulses for lighter confirmations.
        if pattern.count > 1 {
            let generator = UINotificationFeedbackGenerator()
            generator.prepare()
            generator.notificationOccurred(.success)
        } else {
            let generator = UIImpactFeedbackGenerator(style: .medium)
            generator.prepare()
            generator.impactOccurred()
        }
    }
}

// MARK: - Navigation

extension WebViewController: WKNavigationDelegate {

    /// Keep the app itself in the web view; send anything external to Safari.
    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {

        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }

        if url.isFileURL || url.scheme == "about" {
            decisionHandler(.allow)
            return
        }

        decisionHandler(.cancel)
        if UIApplication.shared.canOpenURL(url) {
            UIApplication.shared.open(url)
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        NSLog("[LiftTrack] navigation failed: \(error.localizedDescription)")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        NSLog("[LiftTrack] provisional navigation failed: \(error.localizedDescription)")
    }
}
