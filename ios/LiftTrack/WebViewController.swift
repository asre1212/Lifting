import UIKit
import WebKit

/// Hosts the LiftTrack web app full screen and wires it to native services.
final class WebViewController: UIViewController {

    private static let backgroundColor = UIColor(red: 0x0D / 255, green: 0x0D / 255, blue: 0x0D / 255, alpha: 1)

    private var webView: WKWebView!

    /// The page's globals (`__ltRestSync` and friends) only exist once the
    /// document has run, so native pushes are held until then.
    private var isPageLoaded = false
    /// A `lifttrack://log` open that arrived before the page was ready — which
    /// is the normal case when the Live Activity cold-launches the app.
    private var pendingShowLog = false

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

        let center = NotificationCenter.default
        center.addObserver(
            self,
            selector: #selector(appDidBecomeActive),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
        center.addObserver(
            self,
            selector: #selector(restDidChange),
            name: RestTimerController.restChangedNotification,
            object: nil
        )
        center.addObserver(
            self,
            selector: #selector(openLogRequested),
            name: RestTimerController.openLogNotification,
            object: nil
        )
    }

    @objc private func appDidBecomeActive() {
        RestTimerController.shared.refreshOnForeground()
        syncRestToPage()
        flushPendingOpenLog()
    }

    /// A rest was started from the Lock Screen: the page's own counter has no
    /// idea, so hand it the remaining time.
    @objc private func restDidChange() {
        syncRestToPage()
    }

    @objc private func openLogRequested() {
        flushPendingOpenLog()
    }

    /// Called for the `lifttrack://log` deep link behind the Live Activity.
    func showLogPage() {
        guard isPageLoaded else {
            pendingShowLog = true
            return
        }
        run("window.__ltShowLog && window.__ltShowLog();")
    }

    private func flushPendingShowLog() {
        guard pendingShowLog else { return }
        pendingShowLog = false
        showLogPage()
    }

    private func syncRestToPage() {
        guard isPageLoaded else { return }
        run("window.__ltRestSync && window.__ltRestSync(\(RestTimerController.shared.remainingSeconds));")
    }

    /// "Complete Workout" was tapped on the Lock Screen — possibly before the
    /// page had even loaded, which is why the flag outlives the launch.
    private func flushPendingOpenLog() {
        guard isPageLoaded else { return }
        guard RestTimerController.shared.consumePendingOpenLog() else { return }
        run("window.__ltCompleteWorkout && window.__ltCompleteWorkout();")
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override var prefersHomeIndicatorAutoHidden: Bool { false }

    // MARK: - Setup

    private func buildWebView() {
        let controller = WKUserContentController()
        controller.add(self, name: Channel.store)
        controller.add(self, name: Channel.share)
        controller.add(self, name: Channel.haptics)
        controller.add(self, name: Channel.restTimer)
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

    private func run(_ script: String) {
        webView.evaluateJavaScript(script) { _, error in
            if let error { NSLog("[LiftTrack] script failed: \(error.localizedDescription)") }
        }
    }

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
    static let restTimer = "restTimer"
}

extension WebViewController: WKScriptMessageHandler {

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        switch message.name {
        case Channel.store:     handleStore(message.body)
        case Channel.share:     handleShare(message.body)
        case Channel.haptics:   handleHaptics(message.body)
        case Channel.restTimer: handleRestTimer(message.body)
        default:                break
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

    // MARK: Rest timer

    private func handleRestTimer(_ body: Any) {
        guard let payload = body as? [String: Any], let op = payload["op"] as? String else { return }
        let exercise = (payload["exercise"] as? String) ?? ""

        switch op {
        case "start":
            let seconds = (payload["seconds"] as? NSNumber)?.intValue ?? 0
            let chime = (payload["chime"] as? Bool) ?? true
            RestTimerController.shared.start(seconds: seconds, exercise: exercise, chime: chime)

        case "stop":
            RestTimerController.shared.stop()

        // The user is on the Log page: put the session on the Lock Screen so
        // the rest buttons are there without unlocking.
        case "session":
            RestTimerController.shared.beginSession(exercise: exercise)

        case "exercise":
            RestTimerController.shared.updateExercise(exercise)

        // Workout saved in the app — the Lock Screen session is done with.
        case "endSession":
            RestTimerController.shared.endSession()

        case "requestChime":
            RestTimerController.shared.requestChimeAuthorization { [weak self] granted in
                self?.run("window.__ltChimeAuth && window.__ltChimeAuth(\(granted));")
            }

        default:
            break
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

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        isPageLoaded = true
        syncRestToPage()
        flushPendingShowLog()
        flushPendingOpenLog()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        NSLog("[LiftTrack] navigation failed: \(error.localizedDescription)")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        NSLog("[LiftTrack] provisional navigation failed: \(error.localizedDescription)")
    }
}
