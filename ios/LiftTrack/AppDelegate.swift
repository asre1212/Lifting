import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        // Touch the store early so a corrupt or missing file surfaces at
        // launch rather than on the first save.
        _ = Storage.shared.snapshot

        // Both of these have to happen before any scene comes up, because iOS
        // also launches us in the background purely to run a Lock Screen
        // button's intent — there is no web view involved in that case.
        RestTimerController.shared.registerIntentHandlers()
        RestTimerController.shared.adoptExistingActivity()
        return true
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }
}
