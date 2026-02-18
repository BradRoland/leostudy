import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var appState: AppState
    @State private var showSignOutConfirm = false
    @State private var showResetConfirm = false

    var body: some View {
        List {
            Section {
                Text("Settings")
                    .font(.title3.bold())
                    .foregroundStyle(.white)
                Text("Manage account and app data.")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.8))
            }
            .listRowBackground(Color.clear)

            Section("Account") {
                HStack {
                    Text("Status")
                        .foregroundStyle(.white)
                    Spacer()
                    Text(appState.isSignedIn ? "Signed In" : "Signed Out")
                        .foregroundStyle(.white.opacity(0.8))
                }
                HStack {
                    Text("Username")
                        .foregroundStyle(.white)
                    Spacer()
                    Text(appState.currentPlayerName.isEmpty ? "-" : appState.currentPlayerName)
                        .foregroundStyle(.white.opacity(0.8))
                }
                if appState.isSignedIn {
                    Button(role: .destructive) {
                        showSignOutConfirm = true
                    } label: {
                        Text("Sign Out")
                    }
                }
            }
            .listRowBackground(Color.white.opacity(0.08))

            Section("Danger Zone") {
                Button(role: .destructive) {
                    showResetConfirm = true
                } label: {
                    Text("Reset Entire App Data")
                }
            }
            .listRowBackground(Color.white.opacity(0.08))

            Section("Tools") {
                NavigationLink("Test Mode") {
                    TestModeView()
                }
            }
            .listRowBackground(Color.white.opacity(0.08))
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .appScreenBackground()
        .navigationTitle("More")
        .alert("Sign Out?", isPresented: $showSignOutConfirm) {
            Button("Cancel", role: .cancel) {}
            Button("Sign Out", role: .destructive) {
                appState.signOut()
            }
        } message: {
            Text("You can sign in again at any time.")
        }
        .alert("Reset Entire App?", isPresented: $showResetConfirm) {
            Button("Cancel", role: .cancel) {}
            Button("Reset", role: .destructive) {
                MockLeaderboardService.shared.resetLocalData()
                appState.resetAllAppData()
            }
        } message: {
            Text("This clears progress, highscores, account state, and local leaderboard data.")
        }
    }
}
