import ActivityKit
import Foundation
import UIKit
import UserNotifications

/// Owns everything that happens outside the web view during a workout: the
/// Lock Screen / Dynamic Island Live Activity, its buttons, and the chime that
/// has to fire even when the app is backgrounded or the phone is locked.
///
/// The web app's own `setInterval` freezes the moment the app leaves the
/// foreground, so neither of these can be driven from JavaScript — both are
/// scheduled up front against a wall-clock end date and then left to the
/// system.
///
/// The activity is *session* scoped: it goes up when the user opens the Log
/// page and stays there, idle between sets, until "Complete Workout" is tapped
/// on the Lock Screen or the workout is saved in the app.
final class RestTimerController {

    static let shared = RestTimerController()

    /// Posted when the Lock Screen asks to go back to the app to log a workout.
    static let openLogNotification = Notification.Name("LiftTrackOpenLog")
    /// Posted when a rest is started or cancelled from outside the web view, so
    /// the page's own counter can be brought back in sync.
    static let restChangedNotification = Notification.Name("LiftTrackRestChanged")

    private static let notificationID = "com.lifttrack.rest-over"
    /// Mirrors the web app's own preference key (see Bridge.js).
    private static let chimeKey = "lt_native_chime"
    /// Survives a cold launch triggered by the "Complete Workout" button.
    private static let pendingOpenLogKey = "lt_pending_open_log"

    private var endDate: Date?
    private var totalSeconds = 0
    private var exerciseName = ""
    private var expiryWork: DispatchWorkItem?

    /// Type-erased because `Activity` is only available on iOS 16.2+.
    private var activityBox: Any?

    private init() {}

    /// Seconds left on the running rest, 0 when nothing is running. Used to
    /// re-sync the page after a rest was started from the Lock Screen.
    var remainingSeconds: Int {
        guard let endDate else { return 0 }
        return max(0, Int(endDate.timeIntervalSinceNow.rounded()))
    }

    /// Wires the Lock Screen buttons to this controller. Called at launch —
    /// including the background launch iOS performs to run a `LiveActivityIntent`.
    func registerIntentHandlers() {
        RestIntentHandler.startRest = { [weak self] minutes in
            await self?.startRestFromLockScreen(minutes: minutes)
        }

        RestIntentHandler.completeWorkout = { [weak self] in
            await self?.completeWorkoutFromLockScreen()
        }
    }

    /// A "1 / 2 / 3 MIN" tap. The Live Activity update is awaited here rather
    /// than fired off in a detached task: the app is only kept awake for the
    /// length of the intent, and a suspension mid-update would leave the Lock
    /// Screen showing the old rest.
    @MainActor
    private func startRestFromLockScreen(minutes: Int) async {
        beginCountdown(seconds: max(1, minutes) * 60, exercise: exerciseName, chime: chimeEnabled)
        if #available(iOS 16.2, *) {
            await applyState()
        }
        NotificationCenter.default.post(name: Self.restChangedNotification, object: nil)
    }

    /// A "Complete Workout" tap, awaited for the same reason.
    @MainActor
    private func completeWorkoutFromLockScreen() async {
        cancelCountdown()
        exerciseName = ""

        if #available(iOS 16.2, *) {
            await endActivityAndWait()
        }

        UserDefaults.standard.set(true, forKey: Self.pendingOpenLogKey)
        NotificationCenter.default.post(name: Self.openLogNotification, object: nil)
    }

    // MARK: - Session

    /// Puts the (idle) activity on the Lock Screen for a workout that's just
    /// getting under way, and settles notification permission before the first
    /// rest needs it.
    func beginSession(exercise: String) {
        if !exercise.isEmpty { exerciseName = exercise }

        if chimeEnabled {
            requestChimeAuthorization { _ in }
        }

        if #available(iOS 16.2, *) {
            if activity == nil {
                startActivity(state: RestActivityAttributes.ContentState(
                    startDate: nil,
                    endDate: nil,
                    totalSeconds: 0,
                    exerciseName: exerciseName
                ), staleDate: nil)
            } else {
                pushState()
            }
        }
    }

    /// The user tapped "Complete Workout" (on the Lock Screen or in the app):
    /// clear the countdown, take the activity down, and ask the UI layer to
    /// show the Log page.
    func completeWorkout() {
        cancelCountdown()
        exerciseName = ""

        if #available(iOS 16.2, *) {
            endActivity(dismissImmediately: true)
        }

        UserDefaults.standard.set(true, forKey: Self.pendingOpenLogKey)
        NotificationCenter.default.post(name: Self.openLogNotification, object: nil)
    }

    /// True once, for a "Complete Workout" tap the web view hasn't acted on yet.
    func consumePendingOpenLog() -> Bool {
        let defaults = UserDefaults.standard
        guard defaults.bool(forKey: Self.pendingOpenLogKey) else { return false }
        defaults.removeObject(forKey: Self.pendingOpenLogKey)
        return true
    }

    /// The workout was saved in the app — nothing left to rest for.
    func endSession() {
        cancelCountdown()
        exerciseName = ""
        if #available(iOS 16.2, *) {
            endActivity(dismissImmediately: true)
        }
    }

    /// Keeps the Lock Screen label pointed at whatever the user is lifting now.
    func updateExercise(_ exercise: String) {
        guard exercise != exerciseName else { return }
        exerciseName = exercise
        if #available(iOS 16.2, *), activity != nil {
            pushState()
        }
    }

    // MARK: - Start / stop

    func start(seconds: Int, exercise: String, chime: Bool) {
        guard seconds > 0 else { return }
        beginCountdown(seconds: seconds, exercise: exercise, chime: chime)
        if #available(iOS 16.2, *) {
            pushState()
        }
    }

    /// Everything a new rest needs apart from the Live Activity update, which
    /// the Lock Screen path has to await and the in-app path does not.
    private func beginCountdown(seconds: Int, exercise: String, chime: Bool) {
        guard seconds > 0 else { return }

        cancelCountdown()
        if !exercise.isEmpty { exerciseName = exercise }

        let end = Date().addingTimeInterval(TimeInterval(seconds))
        endDate = end
        totalSeconds = seconds

        if chime {
            scheduleChime(at: seconds)
        }

        // If we're still running when the rest ends, drop our own bookkeeping.
        // The Lock Screen flips to "REST OVER" on its own: the activity's stale
        // date is the rest's end date, so the system re-renders it there even
        // with the app suspended.
        let work = DispatchWorkItem { [weak self] in
            self?.endDate = nil
            self?.expiryWork = nil
        }
        expiryWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + .seconds(seconds), execute: work)
    }

    /// Cancels the running rest but leaves the session's activity in place, so
    /// the Lock Screen keeps its buttons.
    func stop() {
        cancelCountdown()
        if #available(iOS 16.2, *), activity != nil {
            pushState()
        }
    }

    private func cancelCountdown() {
        expiryWork?.cancel()
        expiryWork = nil
        endDate = nil
        totalSeconds = 0

        UNUserNotificationCenter.current()
            .removePendingNotificationRequests(withIdentifiers: [Self.notificationID])
    }

    /// Called when the app returns to the foreground: forgets a rest that ran
    /// out while we were away.
    func refreshOnForeground() {
        if let end = endDate, end <= Date() {
            expiryWork?.cancel()
            expiryWork = nil
            endDate = nil
        }
    }

    // MARK: - Chime

    private var chimeEnabled: Bool {
        // Absent means "on": the chime is the default, the toggle opts out.
        Storage.shared.snapshot[Self.chimeKey] != "0"
    }

    /// Asks for notification permission. The chime is a local notification
    /// because it has to be able to fire with the app in the background.
    func requestChimeAuthorization(completion: @escaping (Bool) -> Void) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral:
                DispatchQueue.main.async { completion(true) }
            case .denied:
                DispatchQueue.main.async { completion(false) }
            default:
                center.requestAuthorization(options: [.alert, .sound]) { granted, error in
                    if let error {
                        NSLog("[LiftTrack] notification authorisation failed: \(error.localizedDescription)")
                    }
                    DispatchQueue.main.async { completion(granted) }
                }
            }
        }
    }

    private func scheduleChime(at seconds: Int) {
        let exercise = exerciseName
        let content = UNMutableNotificationContent()
        content.title = "Rest over"
        content.body = exercise.isEmpty ? "Time for your next set." : "Next set: \(exercise)"
        content.sound = .default
        // Left at the default interruption level on purpose: .timeSensitive
        // needs the Time Sensitive Notifications capability, which would add a
        // provisioning requirement for a fairly small gain.

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: TimeInterval(seconds), repeats: false)
        let request = UNNotificationRequest(identifier: Self.notificationID, content: content, trigger: trigger)

        UNUserNotificationCenter.current().add(request) { error in
            if let error {
                NSLog("[LiftTrack] could not schedule chime: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Live Activity

    @available(iOS 16.2, *)
    private var activity: Activity<RestActivityAttributes>? {
        guard let activity = activityBox as? Activity<RestActivityAttributes> else { return nil }
        // A swipe-away on the Lock Screen ends the activity behind our back.
        guard activity.activityState == .active else {
            activityBox = nil
            return nil
        }
        return activity
    }

    @available(iOS 16.2, *)
    private var currentState: RestActivityAttributes.ContentState {
        RestActivityAttributes.ContentState(
            startDate: endDate.map { $0.addingTimeInterval(-TimeInterval(totalSeconds)) },
            endDate: endDate,
            totalSeconds: totalSeconds,
            exerciseName: exerciseName
        )
    }

    /// Pushes the current rest onto the activity, starting one if the session's
    /// activity was never raised (or was swiped away).
    @available(iOS 16.2, *)
    private func pushState() {
        Task { await applyState() }
    }

    @available(iOS 16.2, *)
    private func applyState() async {
        let state = currentState
        // The countdown's end is also its stale date: that's what makes the
        // system re-render "REST OVER" while the app is suspended.
        let staleDate = state.endDate

        guard let activity else {
            startActivity(state: state, staleDate: staleDate)
            return
        }

        await activity.update(ActivityContent(state: state, staleDate: staleDate))
    }

    @available(iOS 16.2, *)
    private func startActivity(state: RestActivityAttributes.ContentState, staleDate: Date?) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            // User has Live Activities switched off for the app; the timer and
            // the chime still work, there's just nothing on the Lock Screen.
            return
        }

        do {
            activityBox = try Activity.request(
                attributes: RestActivityAttributes(sessionStart: Date()),
                content: ActivityContent(state: state, staleDate: staleDate),
                pushType: nil
            )
        } catch {
            NSLog("[LiftTrack] could not start Live Activity: \(error.localizedDescription)")
        }
    }

    @available(iOS 16.2, *)
    private func endActivity(dismissImmediately: Bool) {
        guard let activity = activityBox as? Activity<RestActivityAttributes> else { return }
        activityBox = nil
        let content = ActivityContent(state: activity.content.state, staleDate: nil)
        let policy: ActivityUIDismissalPolicy = dismissImmediately ? .immediate : .default
        Task {
            await activity.end(content, dismissalPolicy: policy)
        }
    }

    @available(iOS 16.2, *)
    private func endActivityAndWait() async {
        guard let activity = activityBox as? Activity<RestActivityAttributes> else { return }
        activityBox = nil
        await activity.end(
            ActivityContent(state: activity.content.state, staleDate: nil),
            dismissalPolicy: .immediate
        )
    }

    /// Re-adopts the session activity after a relaunch — tapping the Live
    /// Activity is the usual way back into the app, and the workout it belongs
    /// to is still going. Anything beyond the first (a crash mid-session, say)
    /// is cleared so only one session is ever on the Lock Screen.
    func adoptExistingActivity() {
        if #available(iOS 16.2, *) {
            adoptExistingActivityIfPossible()
        }
    }

    @available(iOS 16.2, *)
    private func adoptExistingActivityIfPossible() {
        var live = Activity<RestActivityAttributes>.activities.filter { $0.activityState == .active }
        guard !live.isEmpty else { return }

        let adopted = live.removeFirst()
        activityBox = adopted

        let state = adopted.content.state
        exerciseName = state.exerciseName
        if let end = state.endDate, end > Date() {
            endDate = end
            totalSeconds = state.totalSeconds
            let work = DispatchWorkItem { [weak self] in
                self?.endDate = nil
                self?.expiryWork = nil
            }
            expiryWork = work
            DispatchQueue.main.asyncAfter(deadline: .now() + end.timeIntervalSinceNow, execute: work)
        }

        let strays = live
        Task {
            for stray in strays {
                await stray.end(nil, dismissalPolicy: .immediate)
            }
        }
    }
}
