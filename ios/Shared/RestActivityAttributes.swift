import Foundation
import ActivityKit

/// Describes the rest-timer Live Activity. Compiled into both the app (which
/// starts and ends the activity) and the widget extension (which draws it).
///
/// The countdown itself is rendered with `Text(timerInterval:)`, so the system
/// ticks it down on its own — the app never has to push an update to keep the
/// number moving, which is what makes this work while the phone is locked.
@available(iOS 16.2, *)
struct RestActivityAttributes: ActivityAttributes {

    struct ContentState: Codable, Hashable {
        /// When the rest period ends. Drives the countdown.
        var endDate: Date
        /// Set once the rest is over, so the island can swap to a done state.
        var isFinished: Bool
    }

    /// Exercise being rested between, empty when we don't know it.
    var exerciseName: String
    /// The rest length the user picked, used for the progress ring.
    var totalSeconds: Int
}
