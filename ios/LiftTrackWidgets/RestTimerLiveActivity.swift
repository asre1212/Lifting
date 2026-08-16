import ActivityKit
import SwiftUI
import WidgetKit

/// Rest timer on the Lock Screen and in the Dynamic Island.
@available(iOS 16.2, *)
struct RestTimerLiveActivity: Widget {

    // LiftTrack's core accent, matching the in-app rest counter.
    private static let accent = Color(red: 0.32, green: 0.78, blue: 0.66)

    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestActivityAttributes.self) { context in
            lockScreen(context)
                .activityBackgroundTint(Color.black.opacity(0.9))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label {
                        Text("Rest")
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
                    if context.state.isFinished {
                        Text("Rest over — next set")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.white)
                    } else if !context.attributes.exerciseName.isEmpty {
                        Text(context.attributes.exerciseName)
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
            } compactLeading: {
                Image(systemName: context.state.isFinished ? "checkmark.circle.fill" : "timer")
                    .foregroundStyle(Self.accent)
            } compactTrailing: {
                countdown(context, font: .caption2.weight(.bold).monospacedDigit())
                    .foregroundStyle(Self.accent)
                    // The compact region is tight; without a cap the timer can
                    // push the leading icon out of the island.
                    .frame(maxWidth: 44, alignment: .trailing)
            } minimal: {
                Image(systemName: context.state.isFinished ? "checkmark.circle.fill" : "timer")
                    .foregroundStyle(Self.accent)
            }
            .widgetURL(URL(string: "lifttrack://rest"))
            .keylineTint(Self.accent)
        }
    }

    // MARK: - Lock Screen

    @ViewBuilder
    private func lockScreen(_ context: ActivityViewContext<RestActivityAttributes>) -> some View {
        HStack(spacing: 14) {
            Image(systemName: context.state.isFinished ? "checkmark.circle.fill" : "timer")
                .font(.title2)
                .foregroundStyle(Self.accent)

            VStack(alignment: .leading, spacing: 2) {
                Text(context.state.isFinished ? "REST OVER" : "REST TIMER")
                    .font(.caption2.weight(.heavy))
                    .kerning(0.8)
                    .foregroundStyle(.secondary)

                if context.attributes.exerciseName.isEmpty {
                    Text(context.state.isFinished ? "Next set" : "Recovering")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                } else {
                    Text(context.attributes.exerciseName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 8)

            countdown(context, font: .title.weight(.bold).monospacedDigit())
                .foregroundStyle(.white)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
    }

    // MARK: - Countdown

    /// `Text(timerInterval:)` is rendered and advanced by the system, so the
    /// digits keep ticking with no updates from the app.
    @ViewBuilder
    private func countdown(_ context: ActivityViewContext<RestActivityAttributes>,
                           font: Font) -> some View {
        if context.state.isFinished || context.state.endDate <= Date() {
            Text("0:00")
                .font(font)
        } else {
            Text(timerInterval: Date()...context.state.endDate,
                 countsDown: true,
                 showsHours: false)
                .font(font)
                .multilineTextAlignment(.trailing)
        }
    }
}
