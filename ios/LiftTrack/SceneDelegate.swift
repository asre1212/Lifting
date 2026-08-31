import UIKit

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene,
               willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = WebViewController()
        window.overrideUserInterfaceStyle = .dark
        window.makeKeyAndVisible()
        self.window = window

        handle(connectionOptions.urlContexts)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        handle(URLContexts)
    }

    /// `lifttrack://log` — tapping the Live Activity drops the user straight on
    /// the Log page rather than wherever they left the app.
    private func handle(_ contexts: Set<UIOpenURLContext>) {
        guard contexts.contains(where: { $0.url.scheme == "lifttrack" && $0.url.host == "log" }) else { return }
        (window?.rootViewController as? WebViewController)?.showLogPage()
    }
}
