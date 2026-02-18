import SwiftUI

struct TestModeView: View {
    @EnvironmentObject private var appState: AppState
    @State private var questionCount = 25
    @State private var isTimed = true
    @State private var includePenal = true
    @State private var includeVehicle = true

    var body: some View {
        List {
            Section {
                Text("Exam Simulator")
                    .font(.title3.bold())
                    .foregroundStyle(.white)
                Text("Build timed tests and track readiness.")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.8))
            }
            .listRowBackground(Color.clear)

            Section("Exam Builder") {
                Stepper("Question Count: \(questionCount)", value: $questionCount, in: 10...100, step: 5)
                Toggle("Timed Mode", isOn: $isTimed)
                Toggle("Include Penal Code", isOn: $includePenal)
                Toggle("Include Vehicle Code", isOn: $includeVehicle)
            }
            .listRowBackground(Color.white.opacity(0.08))

            Section("Practice Exams") {
                NavigationLink("Academy Practice Exam") {
                    TestSessionStubView(
                        title: "Academy Practice Exam",
                        details: "Timed mixed exam with foundational and intermediate questions."
                    )
                }
                NavigationLink("Vehicle Code Exam") {
                    TestSessionStubView(
                        title: "Vehicle Code Exam",
                        details: "Vehicle-code-focused exam with traffic stop scenarios."
                    )
                }
                NavigationLink("Mixed Comprehensive") {
                    TestSessionStubView(
                        title: "Mixed Comprehensive",
                        details: "Higher-difficulty mixed set across California Penal and Vehicle code."
                    )
                }
            }
            .listRowBackground(Color.white.opacity(0.08))

            Section("Current Settings Summary") {
                Text("Code coverage: \(coverageSummary)")
                Text("Mode: \(isTimed ? "Timed" : "Untimed")")
            }
            .listRowBackground(Color.white.opacity(0.08))
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .appScreenBackground()
        .tint(AppTheme.sky)
        .navigationTitle("Test Mode")
    }

    private var coverageSummary: String {
        switch (includePenal, includeVehicle) {
        case (true, true):
            return "Penal + Vehicle"
        case (true, false):
            return "Penal only"
        case (false, true):
            return "Vehicle only"
        default:
            return "None selected"
        }
    }
}

struct TestSessionStubView: View {
    let title: String
    let details: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.title2.bold())
                .foregroundStyle(.white)
            Text(details)
                .foregroundStyle(.white.opacity(0.9))
            Text("Next implementation step: full question engine with scoring, review, and retake missed-only.")
                .foregroundStyle(.white.opacity(0.7))
            Spacer()
        }
        .cardContainer()
        .padding()
        .navigationTitle("Session")
        .navigationBarTitleDisplayMode(.inline)
        .appScreenBackground()
    }
}
