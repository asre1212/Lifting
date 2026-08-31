import ActivityKit
import SwiftUI
import WidgetKit

/// Rest timer on the Lock Screen and in the Dynamic Island.
///
/// The activity stays up for the whole workout: between sets it sits idle with
/// its 1 / 2 / 3 minute buttons, during a rest it counts down, and it only
/// leaves when "Complete Workout" is tapped.
@available(iOS 16.2, *)
struct RestTimerLiveActivity: Widget {

    // LiftTrack's core accent, matching the in-app rest counter.
    private static let accent = Color(red: 0.32, green: 0.78, blue: 0.66)

    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestActivityAttributes.self) { context in
            lockScreen(context)
                .activityBackgroundTint(Color.black.opacity(0.9))
                .activitySystemActionForegroundColor(.white)
                .widgetURL(URL(string: "lifttrack://log"))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label {
                        Text(isResting(context) ? "Rest" : "Workout")
                            .font(.caption.weight(.bold))
                    } icon: {
                        Image(systemName: "timer")
                    }
                    .foregroundStyle(Self.accent)
                }

                DynamicIslandExpandedRegion(.trailing) {
                    countdown(context, font: .title2.weight(.bold).monospacedDigit())
                        .foregroundStyle(.white)
                        .frame(maxWidth: 90, alignment: .trailing)
                }

                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 8) {
                        headline(context)
                            .frame(maxWidth: .infinity, alignment: .leading)

                        if #available(iOS 17.0, *) {
                            controls(context)
                        }
                    }
                }
            } compactLeading: {
                Image(systemName: icon(context))
                    .foregroundStyle(Self.accent)
            } compactTrailing: {
                countdown(context, font: .caption2.weight(.bold).monospacedDigit())
                    .foregroundStyle(Self.accent)
                    // The compact region is tight; without a cap the timer can
                    // push the leading icon out of the island.
                    .frame(maxWidth: 44, alignment: .trailing)
            } minimal: {
                Image(systemName: icon(context))
                    .foregroundStyle(Self.accent)
            }
            .widgetURL(URL(string: "lifttrack://log"))
            .keylineTint(Self.accent)
        }
    }

    // MARK: - Lock Screen

    @ViewBuilder
    private func lockScreen(_ context: ActivityViewContext<RestActivityAttributes>) -> some View {
        VStack(spacing: 12) {
            HStack(spacing: 14) {
                ZStack {
                    if let span = restSpan(context) {
                        // Ring and digits are both driven by the system clock,
                        // so neither needs an update from the app to move.
                        ProgressView(timerInterval: span, countsDown: true) {
                            EmptyView()
                        } currentValueLabel: {
                            EmptyView()
                        }
                        .progressViewStyle(.circular)
                        .tint(Self.accent)
                        .frame(width: 34, height: 34)
                    } else {
                        Image(systemName: icon(context))
                            .font(.title2)
                            .foregroundStyle(Self.accent)
                    }
                }
                .frame(width: 34, height: 34)

                headline(context)

                Spacer(minLength: 8)

                countdown(context, font: .title.weight(.bold).monospacedDigit())
                    .foregroundStyle(.white)
            }

            if #available(iOS 17.0, *) {
                controls(context)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
    }

    /// Title + exercise, shared by the Lock Screen and the expanded island.
    @ViewBuilder
    private func headline(_ context: ActivityViewContext<RestActivityAttributes>) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title(context))
                .font(.caption2.weight(.heavy))
                .kerning(0.8)
                .foregroundStyle(.secondary)

            Text(subtitle(context))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .lineLimit(1)
        }
    }

    // MARK: - Buttons

    /// The row that makes the activity worth keeping on the Lock Screen: start
    /// a fresh countdown without unlocking, or close the session out.
    @available(iOS 17.0, *)
    @ViewBuilder
    private func controls(_ context: ActivityViewContext<RestActivityAttributes>) -> some View {
        HStack(spacing: 9) {
            ForEach(RestActivityAttributes.quickRestMinutes, id: \.self) { minutes in
                Button(intent: StartRestIntent(minutes: minutes)) {
                    minuteDial(minutes, selected: isResting(context) && context.state.totalSeconds == minutes * 60)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Rest \(minutes) minute\(minutes == 1 ? "" : "s")")
            }

            Button(intent: CompleteWorkoutIntent()) {
                HStack(spacing: 5) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 11, weight: .heavy))
                    Text("Complete Workout")
                        .font(.system(size: 12, weight: .bold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                .foregroundStyle(Color.black)
                .frame(maxWidth: .infinity)
                .frame(height: 40)
                .background(Capsule().fill(Self.accent))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Complete workout")
        }
    }

    /// A circular "1 MIN" style dial.
    private func minuteDial(_ minutes: Int, selected: Bool) -> some View {
        VStack(spacing: -1) {
            Text("\(minutes)")
                .font(.system(size: 16, weight: .heavy, design: .rounded))
            Text("MIN")
                .font(.system(size: 7, weight: .heavy))
                .kerning(0.4)
        }
        .foregroundStyle(selected ? Color.black : Color.white)
        .frame(width: 40, height: 40)
        .background(
            Circle()
                .fill(selected ? AnyShapeStyle(Self.accent) : AnyShapeStyle(Color.white.opacity(0.12)))
        )
        .overlay(
            Circle()
                .strokeBorder(selected ? Color.clear : Self.accent.opacity(0.55), lineWidth: 1.5)
        )
    }

    // MARK: - State helpers

    /// A rest is on the clock. `isStale` is how the system tells us the
    /// countdown ran out while the app was suspended — the activity's stale
    /// date is set to the rest's end date, so this flips to "rest over" on the
    /// Lock Screen with nothing running to push an update.
    private func isResting(_ context: ActivityViewContext<RestActivityAttributes>) -> Bool {
        !context.isStale && context.state.isCountingDown()
    }

    /// The running rest as a range the system can tick through, or `nil` when
    /// no rest is on the clock. Both `Text(timerInterval:)` and
    /// `ProgressView(timerInterval:)` trap on an inverted range, so the start is
    /// clamped rather than trusted.
    private func restSpan(_ context: ActivityViewContext<RestActivityAttributes>) -> ClosedRange<Date>? {
        guard isResting(context), let end = context.state.endDate else { return nil }
        let fallback = end.addingTimeInterval(-TimeInterval(max(1, context.state.totalSeconds)))
        let start = context.state.startDate.map { min($0, end) } ?? fallback
        return start...end
    }

    private func icon(_ context: ActivityViewContext<RestActivityAttributes>) -> String {
        if isResting(context) { return "timer" }
        return context.state.endDate == nil ? "figure.strengthtraining.traditional" : "checkmark.circle.fill"
    }

    private func title(_ context: ActivityViewContext<RestActivityAttributes>) -> String {
        if isResting(context) { return "REST TIMER" }
        return context.state.endDate == nil ? "WORKOUT" : "REST OVER"
    }

    private func subtitle(_ context: ActivityViewContext<RestActivityAttributes>) -> String {
        if !context.state.exerciseName.isEmpty { return context.state.exerciseName }
        if isResting(context) { return "Recovering" }
        return context.state.endDate == nil ? "Pick a rest below" : "Next set"
    }

    // MARK: - Countdown

    /// `Text(timerInterval:)` is rendered and advanced by the system, so the
    /// digits keep ticking with no updates from the app.
    @ViewBuilder
    private func countdown(_ context: ActivityViewContext<RestActivityAttributes>,
                           font: Font) -> some View {
        if let span = restSpan(context) {
            Text(timerInterval: span, countsDown: true, showsHours: false)
                .font(font)
                .multilineTextAlignment(.trailing)
        } else {
            // A dash until the first rest of the session, then the 0:00 the
            // countdown landed on.
            Text(context.state.endDate == nil ? "—" : "0:00")
                .font(font)
        }
    }
}
