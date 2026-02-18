import Foundation

enum CodeSet: String, CaseIterable, Identifiable, Codable {
    case penal = "Penal Code"
    case healthSafety = "HS Codes"
    case vehicle = "Vehicle Code"

    var id: String { rawValue }
}

struct CodeSection: Identifiable, Codable, Hashable {
    let id: UUID
    let codeSet: CodeSet
    let sectionNumber: String
    let title: String
    let text: String
    let tags: [String]
    let frequentlyTested: Bool
}

struct QuizQuestion: Identifiable, Codable, Hashable {
    let id: UUID
    let codeSet: CodeSet
    let prompt: String
    let choices: [String]
    let correctIndex: Int
    let explanation: String
    let linkedSectionNumber: String
    let difficulty: Difficulty

    enum Difficulty: String, CaseIterable, Identifiable, Codable {
        case basic
        case intermediate
        case advanced

        var id: String { rawValue }
    }
}

struct Flashcard: Identifiable, Codable, Hashable {
    let id: UUID
    let front: String
    let back: String
    let codeSet: CodeSet
}

struct Scenario: Identifiable, Codable, Hashable {
    enum Category: String, CaseIterable, Identifiable, Codable {
        case trafficStops = "Traffic Stops"
        case useOfForce = "Use of Force"

        var id: String { rawValue }
    }

    let id: UUID
    let title: String
    let category: Category
    let summary: String
    let decisions: [String]
    let bestDecisionIndex: Int
    let debrief: String
    let supporterTierRequired: SupporterTier?
}

enum SupporterTier: Int, CaseIterable, Identifiable, Codable {
    case free = 0
    case tier2 = 2
    case tier5 = 5
    case tier10 = 10

    var id: Int { rawValue }

    var displayName: String {
        switch self {
        case .free:
            return "Free"
        case .tier2:
            return "$2 Supporter"
        case .tier5:
            return "$5 Supporter Plus"
        case .tier10:
            return "$10 Supporter Pro"
        }
    }
}

struct ProgressSnapshot {
    var quizzesCompleted: Int
    var flashcardsReviewed: Int
    var scenariosCompleted: Int
    var gamesPlayed: Int
    var averageQuizScore: Double
    var weeklyStudyMinutes: Int
}

enum CodeMasteryLevel: String, Codable {
    case unknown
    case needsWork
    case mastered

    var displayText: String {
        switch self {
        case .unknown:
            return "Unknown"
        case .needsWork:
            return "Needs Work"
        case .mastered:
            return "Mastered"
        }
    }
}

struct CodePerformance: Codable, Hashable {
    var correctCount: Int
    var incorrectCount: Int

    var attempts: Int {
        correctCount + incorrectCount
    }
}
