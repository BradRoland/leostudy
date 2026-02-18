import SwiftUI
import AuthenticationServices

@main
struct CodeReadyApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environmentObject(appState)
                .fullScreenCover(isPresented: onboardingBinding) {
                    FirstLaunchOnboardingView()
                        .environmentObject(appState)
                }
        }
    }

    private var onboardingBinding: Binding<Bool> {
        Binding(
            get: { !appState.hasCompletedOnboarding },
            set: { _ in }
        )
    }
}

private struct FirstLaunchOnboardingView: View {
    private enum Step {
        case welcome
        case signIn
        case username
    }

    @EnvironmentObject private var appState: AppState
    @State private var step: Step = .welcome
    @State private var username = ""
    @State private var welcomeAnimate = false

    var body: some View {
        NavigationStack {
            GeometryReader { geo in
                VStack(spacing: 18) {
                    switch step {
                    case .welcome:
                        Spacer(minLength: max(24, geo.safeAreaInsets.top + 16))
                        Image(systemName: "shield.checkered")
                            .font(.system(size: 80, weight: .bold))
                            .foregroundStyle(AppTheme.sky)
                            .scaleEffect(welcomeAnimate ? 1.0 : 0.72)
                            .opacity(welcomeAnimate ? 1.0 : 0.35)
                            .animation(.spring(response: 0.55, dampingFraction: 0.72), value: welcomeAnimate)
                        Text("Welcome to LEO Study")
                            .font(.largeTitle.bold())
                            .foregroundStyle(.white)
                            .multilineTextAlignment(.center)
                            .opacity(welcomeAnimate ? 1.0 : 0.5)
                        Text("Train smarter. Build mastery. Stay ready.")
                            .foregroundStyle(.white.opacity(0.82))
                            .multilineTextAlignment(.center)
                        Button("Continue") {
                            step = .signIn
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(AppTheme.sky)
                        Spacer(minLength: max(24, geo.safeAreaInsets.bottom + 28))

                    case .signIn:
                        Text("Sign in to continue.")
                            .foregroundStyle(.white.opacity(0.85))
                        SignInWithAppleButton(.signIn) { request in
                            request.requestedScopes = [.fullName, .email]
                        } onCompletion: { result in
                            switch result {
                            case .success(let auth):
                                if let credential = auth.credential as? ASAuthorizationAppleIDCredential {
                                    let suggested = [credential.fullName?.givenName, credential.fullName?.familyName]
                                        .compactMap { $0 }
                                        .joined(separator: " ")
                                    appState.signIn(
                                        provider: .apple,
                                        userIdentifier: credential.user,
                                        suggestedName: suggested.isEmpty ? nil : suggested
                                    )
                                    username = appState.currentPlayerName
                                    step = .username
                                }
                            case .failure:
                                break
                            }
                        }
                        .signInWithAppleButtonStyle(.white)
                        .frame(height: 44)

                        Button {
                            appState.signIn(
                                provider: .google,
                                userIdentifier: UUID().uuidString,
                                suggestedName: nil
                            )
                            username = appState.currentPlayerName
                            step = .username
                        } label: {
                            HStack {
                                Image(systemName: "globe")
                                Text("Continue with Google")
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(AppTheme.sky)

                    case .username:
                        Text("Welcome, \(username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Officer" : username)")
                            .font(.title2.bold())
                            .foregroundStyle(.white)
                        Text("Choose your username for the leaderboard.")
                            .foregroundStyle(.white.opacity(0.85))
                        TextField("Username", text: $username)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled(true)
                            .padding(12)
                            .background(AppTheme.slate.opacity(0.75))
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                            .foregroundStyle(.white)
                        Button("Finish") {
                            appState.completeOnboarding(
                                creativeName: "LEO Study",
                                username: username
                            )
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(AppTheme.sky)
                        .disabled(username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }

                    if step != .welcome {
                        Spacer()
                    }
                }
                .padding()
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            }
            .appScreenBackground()
            .onAppear {
                welcomeAnimate = true
            }
            .toolbar(step == .welcome ? .hidden : .visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text(
                        step == .welcome ? "Step 1 of 3" :
                            step == .signIn ? "Step 2 of 3" : "Step 3 of 3"
                    )
                    .font(.caption.bold())
                    .foregroundStyle(.white.opacity(0.8))
                }
            }
        }
    }
}
