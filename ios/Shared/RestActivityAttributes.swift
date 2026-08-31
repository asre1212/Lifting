import Foundation
import ActivityKit

/// Describes the rest-timer Live Activity. Compiled into both the app (which
/// starts, updates and ends the activity) and the widget extension (which
/// draws it).
///
/// The activity models a whole *workout session*, not a single rest: it goes up
/// when the user opens the Log page and stays on the Lock Screen — idle between
/// sets, counting down during a rest — until they tap "Complete Workout".
///
/// The countdown itself is rendered with `Text(timerInterval:)`, so the system
/// ticks it down on its own — the app never has to push an update to keep the
/// number moving, which is what makes this work while the phone is locked.
@available(iOS 16.2, *)
struct RestActivityAttributes: ActivityAttributes {

    struct ContentState: Codable, Hashable {
        /// When the running rest began. `nil` while no rest is running.
        var startDate: Date?
        /// When the running rest ends. `nil` while no rest is running.
        var endDate: Date?
        /// Length of the running (or just-finished) rest, so the Lock Screen can
        /// mark which of the 1 / 2 / 3 minute buttons is active.
        var totalSeconds: Int
        /// Exercise being rested between, empty when we don't know it.
        var exerciseName: String

        /// A rest is on the clock. Callers on the widget side must also consult
        /// `context.isStale`, which is how the system tells the extension the
        /// countdown ran out while the app was suspended.
        func isCountingDown(at date: Date = Date()) -> Bool {
            guard let endDate else { return false }
            return endDate > date
        }
    }

    /// When the workout session started, shown as "since HH:MM" on the island.
    var sessionStart: Date

    /// Rest lengths offered as buttons on the Lock Screen, in minutes.
    static let quickRestMinutes = [1, 2, 3]
}
