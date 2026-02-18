import Foundation
import Combine

enum AuthProvider: String, Codable {
    case apple = "Apple"
    case google = "Google"
}

enum GameType: String, CaseIterable, Hashable, Codable, Identifiable {
    case matching = "Matching"
    case rapidFire = "Rapid Fire"
    case blaster = "Blaster"
    case caseFile = "Case File"
    case gravity = "Gravity"
    case write = "Write"
    case spell = "Spell"
    case learn = "Learn"
    case live = "Live"

    var id: String { rawValue }
}

final class AppState: ObservableObject {
    private enum DefaultsKey {
        static let creativeAppName = "creativeAppName"
        static let currentPlayerName = "currentPlayerName"
        static let isSignedIn = "isSignedIn"
        static let authProvider = "authProvider"
        static let authUserIdentifier = "authUserIdentifier"
        static let hasCompletedOnboarding = "hasCompletedOnboarding"
    }

    @Published var jurisdictionName: String = "California"
    @Published var selectedCodeSet: CodeSet = .penal
    @Published var currentSupporterTier: SupporterTier = .free
    @Published var favorites: Set<UUID> = []
    @Published var codePerformance: [String: CodePerformance] = [:]
    @Published var gameHighScores: [GameType: Int] = AppState.makeEmptyHighScores()
    @Published var progress = AppState.defaultProgress
    @Published var currentPlayerName: String = ""
    @Published var isSignedIn: Bool = false
    @Published var authProvider: AuthProvider?
    @Published var authUserIdentifier: String?
    @Published var creativeAppName: String = ""
    @Published var hasCompletedOnboarding: Bool = false

    let repository = MockContentRepository()

    init() {
        let defaults = UserDefaults.standard
        currentPlayerName = defaults.string(forKey: DefaultsKey.currentPlayerName) ?? ""
        isSignedIn = defaults.bool(forKey: DefaultsKey.isSignedIn)
        if let rawProvider = defaults.string(forKey: DefaultsKey.authProvider) {
            authProvider = AuthProvider(rawValue: rawProvider)
        } else {
            authProvider = nil
        }
        authUserIdentifier = defaults.string(forKey: DefaultsKey.authUserIdentifier)
        creativeAppName = defaults.string(forKey: DefaultsKey.creativeAppName) ?? ""
        hasCompletedOnboarding = defaults.bool(forKey: DefaultsKey.hasCompletedOnboarding)
    }

    func toggleFavorite(section: CodeSection) {
        if favorites.contains(section.id) {
            favorites.remove(section.id)
        } else {
            favorites.insert(section.id)
        }
    }

    func isUnlocked(_ tier: SupporterTier?) -> Bool {
        guard let tier else { return true }
        return currentSupporterTier.rawValue >= tier.rawValue
    }

    func masteryLevel(for section: CodeSection) -> CodeMasteryLevel {
        masteryLevel(for: section.codeSet, sectionNumber: section.sectionNumber)
    }

    func masteryLevel(for codeSet: CodeSet, sectionNumber: String) -> CodeMasteryLevel {
        let key = codeKey(codeSet: codeSet, sectionNumber: sectionNumber)
        guard let performance = codePerformance[key], performance.attempts > 0 else {
            return .unknown
        }
        return performance.correctCount >= 10 ? .mastered : .needsWork
    }

    func recordQuizResult(question: QuizQuestion, wasCorrect: Bool) -> Bool {
        let key = codeKey(codeSet: question.codeSet, sectionNumber: question.linkedSectionNumber)
        var performance = codePerformance[key] ?? CodePerformance(correctCount: 0, incorrectCount: 0)
        let wasMastered = performance.correctCount >= 10

        if wasCorrect {
            performance.correctCount += 1
        } else {
            performance.incorrectCount += 1
        }

        codePerformance[key] = performance
        let isMasteredNow = performance.correctCount >= 10
        return question.codeSet == .penal && !wasMastered && isMasteredNow
    }

    func recordCodePracticeResult(codeSet: CodeSet, sectionNumber: String, wasCorrect: Bool) -> Bool {
        let key = codeKey(codeSet: codeSet, sectionNumber: sectionNumber)
        var performance = codePerformance[key] ?? CodePerformance(correctCount: 0, incorrectCount: 0)
        let wasMastered = performance.correctCount >= 10

        if wasCorrect {
            performance.correctCount += 1
        } else {
            performance.incorrectCount += 1
        }

        codePerformance[key] = performance
        let isMasteredNow = performance.correctCount >= 10
        return !wasMastered && isMasteredNow
    }

    private func codeKey(codeSet: CodeSet, sectionNumber: String) -> String {
        "\(codeSet.rawValue)|\(sectionNumber.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())"
    }

    func highScore(for game: GameType) -> Int {
        gameHighScores[game] ?? 0
    }

    func recordHighScore(_ score: Int, for game: GameType) {
        guard score > highScore(for: game) else { return }
        gameHighScores[game] = score
    }

    func signIn(provider: AuthProvider, userIdentifier: String, suggestedName: String?) {
        isSignedIn = true
        authProvider = provider
        authUserIdentifier = userIdentifier
        if currentPlayerName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            if let suggestedName, !suggestedName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                currentPlayerName = suggestedName
            } else {
                currentPlayerName = "\(provider.rawValue)User\(Int.random(in: 100...999))"
            }
        }
        persistAuthAndProfile()
    }

    func signOut() {
        isSignedIn = false
        authProvider = nil
        authUserIdentifier = nil
        persistAuthAndProfile()
    }

    func completeOnboarding(creativeName: String, username: String) {
        creativeAppName = creativeName.trimmingCharacters(in: .whitespacesAndNewlines)
        currentPlayerName = username.trimmingCharacters(in: .whitespacesAndNewlines)
        hasCompletedOnboarding = true
        persistAuthAndProfile()
    }

    private func persistAuthAndProfile() {
        let defaults = UserDefaults.standard
        defaults.set(currentPlayerName, forKey: DefaultsKey.currentPlayerName)
        defaults.set(isSignedIn, forKey: DefaultsKey.isSignedIn)
        defaults.set(authProvider?.rawValue, forKey: DefaultsKey.authProvider)
        defaults.set(authUserIdentifier, forKey: DefaultsKey.authUserIdentifier)
        defaults.set(creativeAppName, forKey: DefaultsKey.creativeAppName)
        defaults.set(hasCompletedOnboarding, forKey: DefaultsKey.hasCompletedOnboarding)
    }

    func resetAllAppData() {
        jurisdictionName = "California"
        selectedCodeSet = .penal
        currentSupporterTier = .free
        favorites = []
        codePerformance = [:]
        gameHighScores = AppState.makeEmptyHighScores()
        progress = AppState.defaultProgress
        currentPlayerName = ""
        isSignedIn = false
        authProvider = nil
        authUserIdentifier = nil
        creativeAppName = ""
        hasCompletedOnboarding = false
        persistAuthAndProfile()
    }

    private static func makeEmptyHighScores() -> [GameType: Int] {
        Dictionary(uniqueKeysWithValues: GameType.allCases.map { ($0, 0) })
    }

    private static let defaultProgress = ProgressSnapshot(
        quizzesCompleted: 12,
        flashcardsReviewed: 143,
        scenariosCompleted: 6,
        gamesPlayed: 9,
        averageQuizScore: 78.5,
        weeklyStudyMinutes: 184
    )
}
