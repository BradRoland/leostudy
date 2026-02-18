import SwiftUI

struct ProgressView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        List {
            Section {
                Text("Progress Center")
                    .font(.title3.bold())
                    .foregroundStyle(.white)
                Text("Mastery trends, history, and supporter status.")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.8))
            }
            .listRowBackground(Color.clear)

            Section("Performance") {
                metricRow("Quizzes Completed", value: "\(appState.progress.quizzesCompleted)")
                metricRow("Flashcards Reviewed", value: "\(appState.progress.flashcardsReviewed)")
                metricRow("Scenarios Completed", value: "\(appState.progress.scenariosCompleted)")
                metricRow("Games Played", value: "\(appState.progress.gamesPlayed)")
                metricRow("Average Quiz Score", value: String(format: "%.1f%%", appState.progress.averageQuizScore))
                metricRow("Weekly Study Minutes", value: "\(appState.progress.weeklyStudyMinutes)")
            }
            .listRowBackground(Color.white.opacity(0.08))

            Section("Supporter Tiers") {
                TierCardView(
                    title: "$2 Supporter",
                    perks: "Themes, app icons, and extra scenario pack 1.",
                    isActive: appState.currentSupporterTier.rawValue >= SupporterTier.tier2.rawValue
                )
                TierCardView(
                    title: "$5 Supporter Plus",
                    perks: "Adds pack 2, deeper analytics, and game challenges.",
                    isActive: appState.currentSupporterTier.rawValue >= SupporterTier.tier5.rawValue
                )
                TierCardView(
                    title: "$10 Supporter Pro",
                    perks: "Adds pack 3, readiness scoring, widgets, and export tools.",
                    isActive: appState.currentSupporterTier.rawValue >= SupporterTier.tier10.rawValue
                )

                Picker("Current Tier (Prototype)", selection: $appState.currentSupporterTier) {
                    ForEach(SupporterTier.allCases.filter { $0 != .free }) { tier in
                        Text(tier.displayName).tag(tier)
                    }
                }
            }
            .listRowBackground(Color.white.opacity(0.08))

            Section("Account and Sync") {
                Text("Sync scope: full sync of bookmarks, highlights, notes, quiz/test/scenario history, mastery, streaks, settings, and purchases.")
                    .font(.footnote)
                    .foregroundStyle(.white.opacity(0.8))
                HStack {
                    Image(systemName: "icloud")
                        .foregroundStyle(.white)
                    Text("iCloud sync: Planned")
                        .foregroundStyle(.white)
                }
                HStack {
                    Image(systemName: "person.crop.circle.badge.checkmark")
                        .foregroundStyle(.white)
                    Text("Sign in with Apple + Google: Planned")
                        .foregroundStyle(.white)
                }
            }
            .listRowBackground(Color.white.opacity(0.08))
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .appScreenBackground()
        .navigationTitle("Progress")
    }

    private func metricRow(_ title: String, value: String) -> some View {
        HStack {
            Text(title)
                .foregroundStyle(.white)
            Spacer()
            Text(value)
                .foregroundStyle(.white.opacity(0.75))
        }
    }
}
