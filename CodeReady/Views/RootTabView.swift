import SwiftUI

struct RootTabView: View {
    init() {
        let appearance = UITabBarAppearance()
        appearance.configureWithTransparentBackground()
        appearance.backgroundColor = .clear
        appearance.backgroundEffect = UIBlurEffect(style: .systemUltraThinMaterialDark)
        appearance.shadowColor = .clear

        UITabBar.appearance().isTranslucent = true
        UITabBar.appearance().standardAppearance = appearance
        UITabBar.appearance().scrollEdgeAppearance = appearance
    }

    var body: some View {
        TabView {
            NavigationStack {
                LibraryView()
            }
            .tabItem {
                Label("Library", systemImage: "books.vertical")
            }

            NavigationStack {
                StudyView()
            }
            .tabItem {
                Label("Study", systemImage: "brain.head.profile")
            }

            NavigationStack {
                GamesView()
            }
            .tabItem {
                Label("Games", systemImage: "gamecontroller")
            }

            NavigationStack {
                ScenariosView()
            }
            .tabItem {
                Label("Scenarios", systemImage: "person.2.wave.2")
            }

            NavigationStack {
                SettingsView()
            }
            .tabItem {
                Label("More", systemImage: "ellipsis")
            }

            NavigationStack {
                ProgressView()
            }
            .tabItem {
                Label("Progress", systemImage: "chart.line.uptrend.xyaxis")
            }
        }
        .tint(AppTheme.sky)
        .toolbarBackground(.hidden, for: .tabBar)
        .preferredColorScheme(.dark)
    }
}

enum AppTheme {
    static let ink = Color(red: 0.07, green: 0.1, blue: 0.16)
    static let slate = Color(red: 0.15, green: 0.2, blue: 0.31)
    static let sky = Color(red: 0.18, green: 0.53, blue: 0.95)
    static let mint = Color(red: 0.2, green: 0.77, blue: 0.67)
    static let amber = Color(red: 1.0, green: 0.7, blue: 0.3)

    static let screenGradient = LinearGradient(
        colors: [ink, slate],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let cardGradient = LinearGradient(
        colors: [Color.white.opacity(0.16), Color.white.opacity(0.07)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

struct CardContainer: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(14)
            .background(AppTheme.cardGradient)
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color.white.opacity(0.14), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .shadow(color: .black.opacity(0.2), radius: 12, y: 6)
    }
}

extension View {
    func cardContainer() -> some View {
        modifier(CardContainer())
    }

    func appScreenBackground() -> some View {
        background(AppTheme.screenGradient.ignoresSafeArea())
    }
}
