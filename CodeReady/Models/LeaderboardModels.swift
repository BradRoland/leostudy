import Foundation

// MARK: - Leaderboard Models

enum TimeCategory: String, CaseIterable, Identifiable, Codable {
    case all = "All Times"
    case under15 = "Under 15s"
    case under30 = "Under 30s"
    case under60 = "Under 60s"
    case over60 = "Over 60s"
    
    var id: String { rawValue }
    
    static func from(seconds: Int) -> TimeCategory {
        switch seconds {
        case ..<15: return .under15
        case ..<30: return .under30
        case ..<60: return .under60
        default: return .over60
        }
    }
}

struct LeaderboardEntry: Identifiable, Codable, Hashable {
    let id: UUID
    let playerName: String
    let gameType: GameType
    let codeSet: CodeSet?
    let timeCategory: TimeCategory
    let score: Int
    let duration: Int
    let correctAnswers: Int
    let totalQuestions: Int
    let date: Date
    let isPerfect: Bool
    
    var accuracy: Double {
        guard totalQuestions > 0 else { return 0 }
        return Double(correctAnswers) / Double(totalQuestions) * 100
    }
}

// MARK: - Gravity Game (Asteroids Style)

struct GravityTerm: Identifiable {
    let id = UUID()
    let text: String
    let correctAnswer: String
    var yPosition: CGFloat
    var xPosition: CGFloat
    var isDestroyed: Bool = false
    var isDanger: Bool = false
}

// MARK: - Write Mode

struct WriteQuestion: Identifiable {
    let id = UUID()
    let prompt: String
    let correctAnswers: [String]
    let codeSet: CodeSet
    let linkedSectionNumber: String
    
    func isCorrect(_ answer: String) -> Bool {
        let normalized = answer.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        return correctAnswers.map { $0.lowercased().trimmingCharacters(in: .whitespacesAndNewlines) }.contains(normalized)
    }
}

// MARK: - Spell Mode

struct SpellQuestion: Identifiable {
    let id = UUID()
    let term: String
    let definition: String
    let codeSet: CodeSet
}

// MARK: - Learn Mode (Adaptive)

enum LearnStage: Int, CaseIterable {
    case multipleChoice = 1
    case typeAnswer = 2
    case recall = 3
    
    var displayName: String {
        switch self {
        case .multipleChoice: return "Multiple Choice"
        case .typeAnswer: return "Type Answer"
        case .recall: return "Recall"
        }
    }
}

// MARK: - Live Game (Competitive)

struct LivePlayer: Identifiable, Codable {
    let id: UUID
    let name: String
    var score: Int = 0
    var streak: Int = 0
    var hasAnswered: Bool = false
    var isCorrect: Bool = false
    var answerTime: TimeInterval = 0
}

struct LiveQuestion: Identifiable {
    let id: UUID
    let prompt: String
    let options: [String]
    let correctIndex: Int
    let timeLimit: TimeInterval
}

// MARK: - Game Session Results

struct GameSessionResult: Identifiable, Codable {
    let id: UUID
    let playerName: String
    let gameType: GameType
    let codeSet: CodeSet?
    let duration: Int
    let score: Int
    let correctAnswers: Int
    let totalQuestions: Int
    let date: Date
    let accuracy: Double
    let streakBonus: Int
    let perfectRounds: Int
}

// MARK: - Achievement System

enum Achievement: String, CaseIterable, Identifiable, Codable {
    case firstWin = "first_win"
    case streak5 = "streak_5"
    case streak10 = "streak_10"
    case streak20 = "streak_20"
    case perfectGame = "perfect_game"
    case speedDemon = "speed_demon"
    case codeMaster = "code_master"
    case nightOwl = "night_owl"
    case earlyBird = "early_bird"
    case penalExpert = "penal_expert"
    case hsExpert = "hs_expert"
    case vehicleExpert = "vehicle_expert"
    
    var id: String { rawValue }
    
    var displayName: String {
        switch self {
        case .firstWin: return "First Win"
        case .streak5: return "On Fire (5)"
        case .streak10: return "Unstoppable (10)"
        case .streak20: return "Legendary (20)"
        case .perfectGame: return "Perfect Game"
        case .speedDemon: return "Speed Demon"
        case .codeMaster: return "Code Master"
        case .nightOwl: return "Night Owl"
        case .earlyBird: return "Early Bird"
        case .penalExpert: return "Penal Expert"
        case .hsExpert: return "HS Expert"
        case .vehicleExpert: return "Vehicle Expert"
        }
    }
    
    var icon: String {
        switch self {
        case .firstWin: return "star.fill"
        case .streak5: return "flame.fill"
        case .streak10: return "flame.circle.fill"
        case .streak20: return "crown.fill"
        case .perfectGame: return "checkmark.seal.fill"
        case .speedDemon: return "bolt.fill"
        case .codeMaster: return "book.closed.fill"
        case .nightOwl: return "moon.fill"
        case .earlyBird: return "sun.max.fill"
        case .penalExpert: return "building.columns.fill"
        case .hsExpert: return "cross.case.fill"
        case .vehicleExpert: return "car.fill"
        }
    }
    
    var color: String {
        switch self {
        case .firstWin: return "yellow"
        case .streak5: return "orange"
        case .streak10: return "red"
        case .streak20: return "purple"
        case .perfectGame: return "green"
        case .speedDemon: return "blue"
        case .codeMaster: return "indigo"
        case .nightOwl: return "gray"
        case .earlyBird: return "orange"
        case .penalExpert: return "blue"
        case .hsExpert: return "green"
        case .vehicleExpert: return "red"
        }
    }
}

struct PlayerAchievement: Identifiable, Codable {
    let id: UUID
    let achievement: Achievement
    let dateEarned: Date
    let playerName: String
}

// MARK: - Leaderboard Filter

struct LeaderboardFilter: Equatable {
    var gameType: GameType?
    var codeSet: CodeSet?
    var timeCategory: TimeCategory
    var timeframe: TimeFrame
    
    enum TimeFrame: String, CaseIterable, Identifiable {
        case allTime = "All Time"
        case today = "Today"
        case thisWeek = "This Week"
        case thisMonth = "This Month"
        
        var id: String { rawValue }
    }
}

// MARK: - Enhanced Game Types

extension GameType {
    var description: String {
        switch self {
        case .matching:
            return "Match codes with definitions"
        case .rapidFire:
            return "Answer as many as you can"
        case .blaster:
            return "Blast the correct answer"
        case .caseFile:
            return "Solve the case"
        case .gravity:
            return "Type answers before they fall"
        case .write:
            return "Type the correct answer"
        case .spell:
            return "Spell it out loud"
        case .learn:
            return "Adaptive learning mode"
        case .live:
            return "Compete in real-time"
        }
    }
    
    var icon: String {
        switch self {
        case .matching: return "square.grid.2x2"
        case .rapidFire: return "bolt.fill"
        case .blaster: return "scope"
        case .caseFile: return "folder.fill"
        case .gravity: return "arrow.down.circle.fill"
        case .write: return "pencil"
        case .spell: return "speaker.wave.2.fill"
        case .learn: return "brain.head.fill"
        case .live: return "person.2.fill"
        }
    }
}

// MARK: - Leaderboard Service

protocol LeaderboardServiceProtocol {
    func submitEntry(_ entry: LeaderboardEntry, completion: @escaping (Bool) -> Void)
    func fetchLeaderboard(filter: LeaderboardFilter, limit: Int, completion: @escaping ([LeaderboardEntry]) -> Void)
    func fetchPlayerRank(playerName: String, filter: LeaderboardFilter, completion: @escaping (Int?) -> Void)
    func fetchPlayerStats(playerName: String, completion: @escaping (PlayerStats?) -> Void)
}

struct PlayerStats: Codable {
    let playerName: String
    let totalGamesPlayed: Int
    let totalScore: Int
    let averageAccuracy: Double
    let bestStreak: Int
    let favoriteGame: GameType?
    let achievements: [Achievement]
    let rankByGame: [GameType: Int]
}

// MARK: - Mock Leaderboard Service

class MockLeaderboardService: LeaderboardServiceProtocol {
    static let shared = MockLeaderboardService()
    
    private var entries: [LeaderboardEntry] = []
    private var achievements: [PlayerAchievement] = []
    
    init() {
        // Intentionally starts empty: only real user submissions are shown.
    }

    func resetLocalData() {
        entries.removeAll()
        achievements.removeAll()
    }
    
    private func seedMockData() {
        let names = ["OfficerMike", "CadetSarah", "SgtJohnson", "RookieAlex", "DeputyKim", 
                     "TraineeJordan", "OfficerLee", "CadetMorgan", "SgtWilliams", "OfficerChen"]
        let games: [GameType] = [.matching, .rapidFire, .blaster, .gravity, .write]
        let codeSets: [CodeSet?] = [.penal, .healthSafety, .vehicle, nil]
        let timeCategories: [TimeCategory] = [.under15, .under30, .under60, .over60]
        
        for i in 0..<50 {
            let entry = LeaderboardEntry(
                id: UUID(),
                playerName: names.randomElement()!,
                gameType: games.randomElement()!,
                codeSet: codeSets.randomElement()!,
                timeCategory: timeCategories.randomElement()!,
                score: Int.random(in: 50...100),
                duration: [15, 30, 60, 90, 120].randomElement()!,
                correctAnswers: Int.random(in: 5...20),
                totalQuestions: 20,
                date: Date().addingTimeInterval(-Double.random(in: 0...604800)),
                isPerfect: Bool.random()
            )
            entries.append(entry)
        }
    }
    
    func submitEntry(_ entry: LeaderboardEntry, completion: @escaping (Bool) -> Void) {
        entries.append(entry)
        checkAchievements(for: entry)
        completion(true)
    }
    
    func fetchLeaderboard(filter: LeaderboardFilter, limit: Int, completion: @escaping ([LeaderboardEntry]) -> Void) {
        var filtered = entries
        
        if let gameType = filter.gameType {
            filtered = filtered.filter { $0.gameType == gameType }
        }
        
        if let codeSet = filter.codeSet {
            filtered = filtered.filter { $0.codeSet == codeSet }
        }
        
        if filter.timeCategory != .all {
            filtered = filtered.filter { $0.timeCategory == filter.timeCategory }
        }
        
        switch filter.timeframe {
        case .today:
            filtered = filtered.filter { Calendar.current.isDateInToday($0.date) }
        case .thisWeek:
            filtered = filtered.filter { $0.date > Date().addingTimeInterval(-604800) }
        case .thisMonth:
            filtered = filtered.filter { $0.date > Date().addingTimeInterval(-2592000) }
        case .allTime:
            break
        }
        
        // Sort by score descending, then by date
        filtered.sort {
            if $0.score != $1.score {
                return $0.score > $1.score
            }
            return $0.date > $1.date
        }
        
        completion(Array(filtered.prefix(limit)))
    }
    
    func fetchPlayerRank(playerName: String, filter: LeaderboardFilter, completion: @escaping (Int?) -> Void) {
        fetchLeaderboard(filter: filter, limit: 1000) { entries in
            if let index = entries.firstIndex(where: { $0.playerName == playerName }) {
                completion(index + 1)
            } else {
                completion(nil)
            }
        }
    }
    
    func fetchPlayerStats(playerName: String, completion: @escaping (PlayerStats?) -> Void) {
        let playerEntries = entries.filter { $0.playerName == playerName }
        guard !playerEntries.isEmpty else {
            completion(nil)
            return
        }
        
        let totalScore = playerEntries.reduce(0) { $0 + $1.score }
        let avgAccuracy = playerEntries.reduce(0.0) { $0 + $1.accuracy } / Double(playerEntries.count)
        
        let gameCounts = Dictionary(grouping: playerEntries, by: { $0.gameType })
            .mapValues { $0.count }
        let favoriteGame = gameCounts.max(by: { $0.value < $1.value })?.key
        
        let rankByGame: [GameType: Int] = Dictionary(uniqueKeysWithValues: GameType.allCases.map { game in
            let rank = entries.filter { $0.gameType == game }
                .sorted { $0.score > $1.score }
                .firstIndex { $0.playerName == playerName }
            return (game, (rank ?? 999) + 1)
        })
        
        let playerAchievements = achievements.filter { $0.playerName == playerName }.map { $0.achievement }
        
        let stats = PlayerStats(
            playerName: playerName,
            totalGamesPlayed: playerEntries.count,
            totalScore: totalScore,
            averageAccuracy: avgAccuracy,
            bestStreak: playerEntries.map { $0.score }.max() ?? 0,
            favoriteGame: favoriteGame,
            achievements: playerAchievements,
            rankByGame: rankByGame
        )
        
        completion(stats)
    }
    
    private func checkAchievements(for entry: LeaderboardEntry) {
        var newAchievements: [Achievement] = []
        
        // Check first win
        let previousEntries = entries.filter { $0.playerName == entry.playerName }
        if previousEntries.count == 1 {
            newAchievements.append(.firstWin)
        }
        
        // Check streaks
        if entry.score >= 5 { newAchievements.append(.streak5) }
        if entry.score >= 10 { newAchievements.append(.streak10) }
        if entry.score >= 20 { newAchievements.append(.streak20) }
        
        // Check perfect game
        if entry.isPerfect {
            newAchievements.append(.perfectGame)
        }
        
        // Check speed demon
        if entry.duration <= 15 && entry.score >= 10 {
            newAchievements.append(.speedDemon)
        }
        
        // Check code expert
        if let codeSet = entry.codeSet {
            let codeEntries = entries.filter { $0.playerName == entry.playerName && $0.codeSet == codeSet }
            if codeEntries.count >= 10 {
                switch codeSet {
                case .penal: newAchievements.append(.penalExpert)
                case .healthSafety: newAchievements.append(.hsExpert)
                case .vehicle: newAchievements.append(.vehicleExpert)
                }
            }
        }
        
        // Check night owl / early bird
        let hour = Calendar.current.component(.hour, from: entry.date)
        if hour >= 22 || hour <= 4 {
            newAchievements.append(.nightOwl)
        } else if hour >= 5 && hour <= 8 {
            newAchievements.append(.earlyBird)
        }
        
        for achievement in newAchievements {
            let playerAchievement = PlayerAchievement(
                id: UUID(),
                achievement: achievement,
                dateEarned: Date(),
                playerName: entry.playerName
            )
            achievements.append(playerAchievement)
        }
    }
}

// MARK: - Leaderboard Store

class LeaderboardStore: ObservableObject {
    @Published var entries: [LeaderboardEntry] = []
    @Published var playerStats: PlayerStats?
    @Published var isLoading = false
    @Published var currentFilter = LeaderboardFilter(
        gameType: nil,
        codeSet: nil,
        timeCategory: .all,
        timeframe: .allTime
    )
    
    private let service: LeaderboardServiceProtocol
    
    init(service: LeaderboardServiceProtocol = MockLeaderboardService.shared) {
        self.service = service
    }
    
    func loadLeaderboard(limit: Int = 50) {
        isLoading = true
        service.fetchLeaderboard(filter: currentFilter, limit: limit) { [weak self] entries in
            DispatchQueue.main.async {
                self?.entries = entries
                self?.isLoading = false
            }
        }
    }
    
    func submitScore(playerName: String, gameType: GameType, codeSet: CodeSet?, duration: Int, score: Int, correct: Int, total: Int) {
        let entry = LeaderboardEntry(
            id: UUID(),
            playerName: playerName,
            gameType: gameType,
            codeSet: codeSet,
            timeCategory: TimeCategory.from(seconds: duration),
            score: score,
            duration: duration,
            correctAnswers: correct,
            totalQuestions: total,
            date: Date(),
            isPerfect: correct == total
        )
        
        service.submitEntry(entry) { [weak self] _ in
            self?.loadLeaderboard()
        }
    }
    
    func loadPlayerStats(playerName: String) {
        service.fetchPlayerStats(playerName: playerName) { [weak self] stats in
            DispatchQueue.main.async {
                self?.playerStats = stats
            }
        }
    }
}
