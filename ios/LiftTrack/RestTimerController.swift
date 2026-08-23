import ActivityKit
import Foundation
import UIKit
import UserNotifications

/// Owns everything that happens outside the web view when a rest timer runs:
/// the Dynamic Island / Lock Screen Live Activity, and the chime that has to
/// fire even when the app is backgrounded or the phone is locked.
///
/// The web app's own `setInterval` freezes the moment the app leaves the
/// foreground, so neither of these can be driven from JavaScript — both are
/// scheduled up front against a wall-clock end date and then left to the
/// system.
final class RestTimerController {

    static let shared = RestTimerController()

    private static let notificationID = "com.lifttrack.rest-over"

    private var endDate: Date?
    private var expiryWork: DispatchWorkItem?

    /// Type-erased because `Activity` is only available on iOS 16.2+.
    private var activityBox: Any?

    private init() {}

    // MARK: - Start / stop

    func start(seconds: Int, exercise: String, chime: Bool) {
        guard seconds > 0 else { return }

        stop() // a new rest replaces whatever was running

        let end = Date().addingTimeInterval(TimeInterval(seconds))
        endDate = end

        if chime {
            scheduleChime(at: seconds, exercise: exercise)
        }

        if #available(iOS 16.2, *) {
            startActivity(endDate: end, exercise: exercise, totalSeconds: seconds)
        }

        // If we're still in the foreground when the rest ends, flip the
        // activity to its finished state and let it linger briefly.
        let work = DispatchWorkItem { [weak self] in
            self?.markFinished()
        }
        expiryWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + .seconds(seconds), execute: work)
    }

    func stop() {
        expiryWork?.cancel()
        expiryWork = nil
        endDate = nil

        UNUserNotificationCenter.current()
            .removePendingNotificationRequests(withIdentifiers: [Self.notificationID])

        if #available(iOS 16.2, *) {
            endActivity(dismissImmediately: true)
        }
    }

    /// Called when the app returns to the foreground: clears any activity left
    /// over from a rest that finished while we were away.
    func refreshOnForeground() {
        guard let end = endDate else { return }
        if end <= Date() {
            markFinished()
        }
    }

    private func markFinished() {
        expiryWork = nil
        endDate = nil
        if #available(iOS 16.2, *) {
            finishActivity()
        }
    }

    // MARK: - Chime

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

    private func scheduleChime(at seconds: Int, exercise: String) {
        let content = UNMutableNotificationContent()
        content.title = "Rest over"
        content.body = exercise.isEmpty ? "Time for your next set." : "Next set: \(exercise)"
        content.sound = .default

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
        activityBox as? Activity<RestActivityAttributes>
    }

    @available(iOS 16.2, *)
    private func startActivity(endDate: Date, exercise: String, totalSeconds: Int) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            // User has Live Activities switched off for the app; the timer and
            // the chime still work, there's just nothing on the Lock Screen.
            return
        }

        let attributes = RestActivityAttributes(exerciseName: exercise, totalSeconds: totalSeconds)
        let state = RestActivityAttributes.ContentState(endDate: endDate, isFinished: false)

        do {
            activityBox = try Activity.request(
                attributes: attributes,
                content: ActivityContent(state: state, staleDate: endDate.addingTimeInterval(60)),
                pushType: nil
            )
        } catch {
            NSLog("[LiftTrack] could not start Live Activity: \(error.localizedDescription)")
        }
    }

    @available(iOS 16.2, *)
    private func finishActivity() {
        guard let activity else { return }
        let state = RestActivityAttributes.ContentState(endDate: activity.content.state.endDate, isFinished: true)
        Task {
            // Show "rest over" briefly, then let the system clear it.
            await activity.end(
                ActivityContent(state: state, staleDate: nil),
                dismissalPolicy: .after(Date().addingTimeInterval(15))
            )
        }
        activityBox = nil
    }

    @available(iOS 16.2, *)
    private func endActivity(dismissImmediately: Bool) {
        guard let activity else { return }
        let state = activity.content.state
        Task {
            await activity.end(
                ActivityContent(state: state, staleDate: nil),
                dismissalPolicy: dismissImmediately ? .immediate : .default
            )
        }
        activityBox = nil
    }

    /// Clears activities orphaned by a crash or force-quit during a rest.
    func clearOrphanedActivities() {
        guard #available(iOS 16.2, *) else { return }
        Task {
            for activity in Activity<RestActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
    }
}
