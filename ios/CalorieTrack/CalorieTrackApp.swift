import SwiftUI
import WebKit

@main
struct CalorieTrackApp: App {
    var body: some Scene {
        WindowGroup { CalorieTrackView().ignoresSafeArea() }
    }
}

struct CalorieTrackView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> CalorieTrackController { CalorieTrackController() }
    func updateUIViewController(_ controller: CalorieTrackController, context: Context) {}
}

final class CalorieTrackController: UIViewController, WKScriptMessageHandlerWithReply, WKNavigationDelegate {
    private let health = HealthStore()
    private var webView: WKWebView!
    private var webRoot: URL!

    override func viewDidLoad() {
        super.viewDidLoad()
        guard let root = Bundle.main.url(forResource: "web", withExtension: nil) else {
            let label = UILabel()
            label.text = "Run npm run build:ios on your Mac, then rebuild the app."
            label.numberOfLines = 0
            label.textAlignment = .center
            view = label
            return
        }
        webRoot = root
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "appleHealth")
        configuration.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "exportBackup")
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        view = webView
        webView.loadFileURL(root.appendingPathComponent("index.html"), allowingReadAccessTo: root)
        NotificationCenter.default.addObserver(self, selector: #selector(becameActive),
            name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    @objc private func becameActive() {
        webView?.evaluateJavaScript("window.dispatchEvent(new Event('apple-health-changed'))", completionHandler: nil)
    }

    private func isBundledPage(_ url: URL?) -> Bool {
        guard let url, url.isFileURL, let root = webRoot else { return false }
        return url.standardizedFileURL.path == root.appendingPathComponent("index.html").standardizedFileURL.path
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        // Never expose device data to remote pages, child frames or external links.
        guard message.frameInfo.isMainFrame, isBundledPage(message.frameInfo.request.url),
              let body = message.body as? [String: Any] else {
            replyHandler(nil, "Apple Health is only available to the bundled CalorieTrack app.")
            return
        }
        if message.name == "exportBackup" {
            guard let json = body["data"] as? String, let date = body["date"] as? String,
                  date.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil else {
                replyHandler(nil, "Invalid backup."); return
            }
            do {
                let url = FileManager.default.temporaryDirectory.appendingPathComponent("calorietrack-backup-\(date).json")
                try Data(json.utf8).write(to: url, options: [.atomic, .completeFileProtection])
                let share = UIActivityViewController(activityItems: [url], applicationActivities: nil)
                share.popoverPresentationController?.sourceView = view
                present(share, animated: true)
                replyHandler(true, nil)
            } catch { replyHandler(nil, error.localizedDescription) }
            return
        }
        Task { @MainActor in
            do {
                switch body["action"] as? String {
                case "authorize":
                    try await health.authorize()
                    replyHandler(true, nil)
                case "read":
                    replyHandler(try await health.snapshot(), nil)
                default: replyHandler(nil, "Unknown Apple Health request.")
                }
            } catch { replyHandler(nil, error.localizedDescription) }
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = navigationAction.request.url
        if navigationAction.targetFrame?.isMainFrame == true && isBundledPage(url) {
            decisionHandler(.allow)
        } else {
            if navigationAction.navigationType == .linkActivated, let url,
               ["https", "http"].contains(url.scheme?.lowercased() ?? "") {
                UIApplication.shared.open(url)
            }
            decisionHandler(.cancel)
        }
    }

    deinit { NotificationCenter.default.removeObserver(self) }
}
