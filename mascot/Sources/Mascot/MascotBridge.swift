#if canImport(WebKit)
import WebKit

/// Lets the web app (the React UI inside a `WKWebView`) tell the mascot how busy it is.
///
/// JavaScript side:
///     window.webkit?.messageHandlers?.pip?.postMessage({ type: 'jobs', active: 1, max: 2 })
///
/// Only two integers are accepted and nothing from the page is ever shown or sent to the language
/// model, so a web page cannot inject text into the mascot.
@MainActor
public final class MascotBridge: NSObject, WKScriptMessageHandler {
    public static let handlerName = "pip"
    private weak var pulse: SystemPulse?

    public init(pulse: SystemPulse) {
        self.pulse = pulse
        super.init()
    }

    /// Call before creating the web view: `bridge.attach(to: configuration)`.
    public func attach(to configuration: WKWebViewConfiguration) {
        configuration.userContentController.add(self, name: Self.handlerName)
    }

    /// WKUserContentController keeps a strong reference to its handlers; remove it on teardown.
    public func detach(from configuration: WKWebViewConfiguration) {
        configuration.userContentController.removeScriptMessageHandler(forName: Self.handlerName)
    }

    public func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              body["type"] as? String == "jobs",
              let active = (body["active"] as? NSNumber)?.intValue,
              let limit = (body["max"] as? NSNumber)?.intValue,
              (0...10_000).contains(active), (1...10_000).contains(limit)
        else { return }
        pulse?.setJobs(active: active, max: limit)
    }
}
#endif
