import AppIntents
import Foundation

/// Bridge between the Lock Screen buttons and the app.
///
/// The intents below are compiled into both targets: the widget extension needs
/// the types to build its buttons, the app needs them to run `perform()`. A
/// `LiveActivityIntent` always executes in the *app's* process (iOS launches the
/// app in the background if it isn't running), so the work itself lives behind
/// this registry — `RestTimerController` installs the closures at launch, and in
/// the widget process they simply stay `nil` and are never called.
enum RestIntentHandler {

    /// Starts a rest of the given whole minutes.
    ///
    /// Async on purpose: iOS only keeps the app awake for as long as `perform()`
    /// runs, so the Live Activity update has to be awaited inside it rather than
    /// left to a detached task that a suspension would cut short.
    static var startRest: (@MainActor (Int) async -> Void)?

    /// Ends the session: tears down the Lock Screen activity and sends the user
    /// back into the app to log the workout.
    static var completeWorkout: (@MainActor () async -> Void)?
}

/// "1 / 2 / 3 MIN" — starts (or restarts) the countdown from the Lock Screen.
@available(iOS 17.0, *)
struct StartRestIntent: LiveActivityIntent {

    static var title: LocalizedStringResource = "Start Rest Timer"
    static var description = IntentDescription("Starts a rest countdown for the current set.")
    /// Only ever invoked from the Live Activity, so keep it out of Shortcuts.
    static var isDiscoverable: Bool = false
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Minutes")
    var minutes: Int

    init() {
        self.minutes = 1
    }

    init(minutes: Int) {
        self.minutes = minutes
    }

    func perform() async throws -> some IntentResult {
        await RestIntentHandler.startRest?(minutes)
        return .result()
    }
}

/// "Complete Workout" — clears the Lock Screen and opens the app on the Log page.
@available(iOS 17.0, *)
struct CompleteWorkoutIntent: LiveActivityIntent {

    static var title: LocalizedStringResource = "Complete Workout"
    static var description = IntentDescription("Ends the rest timer session and opens LiftTrack to log the workout.")
    static var isDiscoverable: Bool = false
    /// The whole point of the button: hand the user back to the app.
    static var openAppWhenRun: Bool = true

    init() {}

    func perform() async throws -> some IntentResult {
        await RestIntentHandler.completeWorkout?()
        return .result()
    }
}
