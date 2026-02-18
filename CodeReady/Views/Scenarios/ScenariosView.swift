import SwiftUI

struct ScenariosView: View {
    @EnvironmentObject private var appState: AppState
    @State private var category: Scenario.Category = .trafficStops

    private var scenarios: [Scenario] {
        appState.repository.scenarios.filter { $0.category == category }
    }

    var body: some View {
        List {
            Section {
                Text("Scenario Lab")
                    .font(.title3.bold())
                    .foregroundStyle(.white)

                Picker("Category", selection: $category) {
                    ForEach(Scenario.Category.allCases) { category in
                        Text(category.rawValue).tag(category)
                    }
                }
                .pickerStyle(.segmented)

                Text("Training mode includes debrief after each decision. Evaluation mode can be added next.")
                    .font(.footnote)
                    .foregroundStyle(.white.opacity(0.8))
            }
            .listRowBackground(Color.clear)

            Section("\(category.rawValue) Scenarios") {
                ForEach(scenarios) { scenario in
                    NavigationLink {
                        ScenarioPlayView(scenario: scenario)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(scenario.title)
                                    .font(.headline)
                                    .foregroundStyle(.white)
                                Spacer()
                                if !appState.isUnlocked(scenario.supporterTierRequired) {
                                    Text(scenario.supporterTierRequired?.displayName ?? "")
                                        .font(.caption2.bold())
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 3)
                                        .background(Color.yellow.opacity(0.2))
                                        .clipShape(Capsule())
                                }
                            }
                            Text(scenario.summary)
                                .font(.subheadline)
                                .foregroundStyle(.white.opacity(0.8))
                        }
                    }
                    .disabled(!appState.isUnlocked(scenario.supporterTierRequired))
                }
            }
            .listRowBackground(Color.white.opacity(0.08))
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .appScreenBackground()
        .navigationTitle("Scenarios")
    }
}

struct ScenarioPlayView: View {
    @EnvironmentObject private var appState: AppState
    let scenario: Scenario
    @State private var selectedIndex: Int?
    @State private var isSubmitted = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(scenario.title)
                    .font(.title2.bold())
                    .foregroundStyle(.white)
                Text(scenario.summary)
                    .font(.body)
                    .foregroundStyle(.white.opacity(0.9))

                Text("Decision")
                    .font(.headline)
                    .foregroundStyle(.white)
                ForEach(scenario.decisions.indices, id: \.self) { index in
                    Button {
                        selectedIndex = index
                    } label: {
                        HStack(alignment: .top) {
                            Image(systemName: selectedIndex == index ? "largecircle.fill.circle" : "circle")
                                .foregroundStyle(.white)
                            Text(scenario.decisions[index])
                                .foregroundStyle(.white)
                            Spacer()
                        }
                    }
                    .buttonStyle(.plain)
                    .padding(12)
                    .background(AppTheme.slate.opacity(0.5))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                Button("Submit Decision") {
                    isSubmitted = true
                    appState.progress.scenariosCompleted += 1
                }
                .buttonStyle(.borderedProminent)
                .tint(AppTheme.sky)
                .disabled(selectedIndex == nil || isSubmitted)

                if isSubmitted {
                    let isCorrect = selectedIndex == scenario.bestDecisionIndex
                    Text(isCorrect ? "Recommended decision selected." : "Review recommended approach.")
                        .font(.headline)
                        .foregroundStyle(isCorrect ? .green : .orange)
                    Text(scenario.debrief)
                        .foregroundStyle(.white.opacity(0.85))
                }
            }
            .cardContainer()
            .padding()
        }
        .navigationTitle("Scenario")
        .navigationBarTitleDisplayMode(.inline)
        .appScreenBackground()
    }
}
