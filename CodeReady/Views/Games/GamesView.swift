import SwiftUI
import AuthenticationServices

struct GamesView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        List {
            Section {
                Text("Arcade Training")
                    .font(.title3.bold())
                    .foregroundStyle(.white)
                Text("Short, high-repeat sessions for fast recall.")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.8))
            }
            .listRowBackground(Color.clear)

            Section("Global Leaderboard") {
                NavigationLink { GlobalLeaderboardView() } label: {
                    HStack {
                        Image(systemName: "trophy.fill")
                            .foregroundStyle(.yellow)
                        Text("🏆 Global Leaderboard")
                            .foregroundStyle(.white)
                        Spacer()
                        Text("Compete Worldwide")
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.6))
                    }
                }
            }
            .listRowBackground(Color.white.opacity(0.12))

            Section("Classic Games") {
                NavigationLink { MatchingGameView() } label: {
                    GameRow(icon: "square.grid.2x2", title: "Matching", subtitle: "Match codes with definitions")
                }
                disabledComingSoonRow(icon: "bolt.fill", title: "Rapid Fire", subtitle: "Temporarily disabled")
                disabledComingSoonRow(icon: "arrow.down.circle.fill", title: "Gravity", subtitle: "Temporarily disabled")
            }
            .listRowBackground(Color.white.opacity(0.08))

            Section("Premium Games") {
                if appState.isUnlocked(.tier2) {
                    NavigationLink { BlasterGameView() } label: {
                        GameRow(icon: "scope", title: "Blaster", subtitle: "Tag the correct answer")
                    }
                } else {
                    lockedRow(title: "Blaster", tier: .tier2)
                }
                if appState.isUnlocked(.tier5) {
                    NavigationLink { CaseFileGameView() } label: {
                        GameRow(icon: "folder.fill", title: "Case File", subtitle: "Solve the scenario")
                    }
                } else {
                    lockedRow(title: "Case File", tier: .tier5)
                }
            }
            .listRowBackground(Color.white.opacity(0.08))

            Section("Your High Scores") {
                ForEach(GameType.allCases, id: \.self) { game in
                    highScoreRow(title: game.rawValue, score: appState.highScore(for: game))
                }
            }
            .listRowBackground(Color.white.opacity(0.08))
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .appScreenBackground()
        .navigationTitle("Games")
    }

    @ViewBuilder
    private func lockedRow(title: String, tier: SupporterTier) -> some View {
        HStack {
            Text(title)
                .foregroundStyle(.white.opacity(0.8))
            Spacer()
            Text(tier.displayName)
                .font(.caption2.bold())
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.yellow.opacity(0.2))
                .clipShape(Capsule())
        }
    }

    private func highScoreRow(title: String, score: Int) -> some View {
        HStack {
            Text(title)
                .foregroundStyle(.white)
            Spacer()
            Text("\(score)")
                .font(.headline)
                .foregroundStyle(.white.opacity(0.9))
        }
    }

    private func disabledComingSoonRow(icon: String, title: String, subtitle: String) -> some View {
        HStack {
            GameRow(icon: icon, title: title, subtitle: subtitle)
                .opacity(0.55)
            Spacer()
            Text("OFF")
                .font(.caption2.bold())
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.gray.opacity(0.35))
                .clipShape(Capsule())
                .foregroundStyle(.white.opacity(0.85))
        }
    }
}

struct GameRow: View {
    let icon: String
    let title: String
    let subtitle: String
    
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(AppTheme.sky)
                .frame(width: 32)
            
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.white)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.6))
            }
        }
    }
}

struct MatchingGameView: View {
    enum MatchScope: String, CaseIterable, Identifiable {
        case penal = "Penal"
        case healthSafety = "HS"
        case vehicle = "Vehicle"
        case all = "All"

        var id: String { rawValue }
    }

    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var cards: [MatchingCard] = []
    @State private var selectedCardID: UUID?
    @State private var matchedSectionIDs: Set<UUID> = []
    @State private var score = 0
    @State private var rounds = 0
    @State private var feedback = ""
    @State private var lockInput = false
    @State private var selectedDuration = 30
    @State private var timeRemaining = 30
    @State private var sessionActive = false
    @State private var showSessionSummary = false
    @State private var selectedScope: MatchScope = .penal
    @State private var highScore = 0
    @State private var sectionDeck: [UUID] = []
    @State private var sectionDeckIndex = 0
    @State private var sectionDeckSignature = ""
    @State private var recentSectionIDs: [UUID] = []

    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    private var sourceSections: [CodeSection] {
        let allSections = appState.repository.sections
        switch selectedScope {
        case .penal:
            return allSections.filter { $0.codeSet == .penal }
        case .healthSafety:
            return allSections.filter { $0.codeSet == .healthSafety }
        case .vehicle:
            return allSections.filter { $0.codeSet == .vehicle }
        case .all:
            return allSections
        }
    }

    var body: some View {
        GeometryReader { geo in
            let cardHeight = max(88, min(120, (geo.size.height - 390) / 3))
            matchingLayout(cardHeight: cardHeight)
            .padding()
            .padding(.bottom, max(22, geo.safeAreaInsets.bottom + 56))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
        .appScreenBackground()
        .navigationTitle("Matching")
        .navigationBarTitleDisplayMode(.inline)
        .onReceive(timer) { _ in
            guard sessionActive else { return }
            if timeRemaining > 0 {
                timeRemaining -= 1
            } else {
                endSession()
            }
        }
        .overlay {
            if showSessionSummary {
                GameOverLeaderboardView(
                    gameType: .matching,
                    codeSet: codeSetFromScope(selectedScope),
                    duration: selectedDuration - timeRemaining,
                    score: score,
                    correctAnswers: score,
                    totalQuestions: rounds * 3,
                    onPlayAgain: {
                        startSession()
                    },
                    onExit: {
                        dismiss()
                    }
                )
            }
        }
        .onAppear {
            highScore = appState.highScore(for: .matching)
        }
        .onChange(of: selectedScope) {
            sectionDeck = []
            sectionDeckIndex = 0
            sectionDeckSignature = ""
            recentSectionIDs.removeAll()
            cards = []
            feedback = ""
        }
    }

    @ViewBuilder
    private func matchingLayout(cardHeight: CGFloat) -> some View {
        VStack(spacing: 14) {
            Text("Matching")
                .font(.title2.bold())
                .foregroundStyle(.white)
            Text("Match each code with its definition.")
                .foregroundStyle(.white.opacity(0.8))

            controlsCard

            cardsGrid(cardHeight: cardHeight)

            if !feedback.isEmpty {
                Text(feedback)
                    .foregroundStyle(.white.opacity(0.9))
            }
            Spacer(minLength: 0)
        }
    }

    private var controlsCard: some View {
        VStack(spacing: 10) {
            Picker("Time", selection: $selectedDuration) {
                Text("15s").tag(15)
                Text("30s").tag(30)
                Text("60s").tag(60)
            }
            .pickerStyle(.segmented)
            .disabled(sessionActive)

            Picker("Codes", selection: $selectedScope) {
                ForEach(MatchScope.allCases) { scope in
                    Text(scope.rawValue).tag(scope)
                }
            }
            .pickerStyle(.segmented)
            .disabled(sessionActive)

            HStack {
                Text("Time: \(timeRemaining)s")
                Spacer()
                Text("Score: \(score)")
                Spacer()
                Text("Rounds: \(rounds)")
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white.opacity(0.9))

            Button(sessionActive ? "Session Running" : "Start Session") {
                startSession()
            }
            .buttonStyle(.borderedProminent)
            .tint(AppTheme.sky)
            .disabled(sessionActive || showSessionSummary)
        }
        .cardContainer()
    }

    private func cardsGrid(cardHeight: CGFloat) -> some View {
        LazyVGrid(
            columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)],
            spacing: 10
        ) {
            ForEach(cards) { card in
                Button {
                    handleSelection(card)
                } label: {
                    MatchingCardTile(
                        card: card,
                        cardHeight: cardHeight,
                        background: cardBackground(card),
                        border: borderColor(card)
                    )
                }
                .buttonStyle(.plain)
                .disabled(lockInput || matchedSectionIDs.contains(card.sectionID) || !sessionActive || showSessionSummary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .top)
    }

    private func generateRound() {
        guard sourceSections.count >= 3 else {
            cards = []
            feedback = "Not enough sections in this code set yet."
            return
        }
        rounds += 1
        feedback = ""
        selectedCardID = nil
        matchedSectionIDs.removeAll()
        lockInput = false

        let picked = drawUniqueSections(count: 3)
        guard picked.count == 3 else {
            cards = []
            feedback = "Unable to generate enough unique matches."
            return
        }
        var newCards: [MatchingCard] = []
        newCards.reserveCapacity(6)

        for section in picked {
            newCards.append(
                MatchingCard(
                    id: UUID(),
                    sectionID: section.id,
                    text: section.sectionNumber,
                    kind: .code
                )
            )
            newCards.append(
                MatchingCard(
                    id: UUID(),
                    sectionID: section.id,
                    text: section.title,
                    kind: .definition
                )
            )
        }

        cards = newCards.shuffled()
    }

    private func startSession() {
        score = 0
        rounds = 0
        timeRemaining = selectedDuration
        sessionActive = true
        showSessionSummary = false
        sectionDeck = []
        sectionDeckIndex = 0
        sectionDeckSignature = ""
        recentSectionIDs.removeAll()
        generateRound()
    }

    private func endSession() {
        sessionActive = false
        lockInput = true
        highScore = max(highScore, score)
        appState.recordHighScore(score, for: .matching)
        feedback = "Time up."
        showSessionSummary = true
    }

    private func drawUniqueSections(count: Int) -> [CodeSection] {
        prepareSectionDeckIfNeeded()
        var selected: [CodeSection] = []
        var selectedSet: Set<UUID> = []
        let sectionByID = Dictionary(uniqueKeysWithValues: sourceSections.map { ($0.id, $0) })
        var guardCounter = 0

        while selected.count < count && guardCounter < sourceSections.count * 4 {
            guardCounter += 1
            if sectionDeckIndex >= sectionDeck.count {
                reshuffleSectionDeck()
            }
            guard sectionDeckIndex < sectionDeck.count else { break }
            let id = sectionDeck[sectionDeckIndex]
            sectionDeckIndex += 1
            guard !selectedSet.contains(id), let section = sectionByID[id] else { continue }
            selectedSet.insert(id)
            selected.append(section)
        }

        if !selected.isEmpty {
            recentSectionIDs.append(contentsOf: selected.map(\.id))
            if recentSectionIDs.count > 18 {
                recentSectionIDs.removeFirst(recentSectionIDs.count - 18)
            }
        }
        return selected
    }

    private func prepareSectionDeckIfNeeded() {
        let signature = sourceSections.map(\.id.uuidString).sorted().joined(separator: "|")
        if signature != sectionDeckSignature || sectionDeck.isEmpty {
            sectionDeckSignature = signature
            reshuffleSectionDeck()
        }
    }

    private func reshuffleSectionDeck() {
        var ids = sourceSections.map(\.id)
        ids.shuffle()
        let recentSet = Set(recentSectionIDs.suffix(9))
        if !recentSet.isEmpty {
            let nonRecent = ids.filter { !recentSet.contains($0) }
            let recent = ids.filter { recentSet.contains($0) }
            ids = nonRecent + recent
        }
        sectionDeck = ids
        sectionDeckIndex = 0
    }

    private func handleSelection(_ card: MatchingCard) {
        guard sessionActive, !lockInput else { return }
        guard !matchedSectionIDs.contains(card.sectionID) else { return }

        if let selectedCardID {
            guard let first = cards.first(where: { $0.id == selectedCardID }) else {
                self.selectedCardID = card.id
                return
            }
            guard first.id != card.id else { return }

            if first.sectionID == card.sectionID, first.kind != card.kind {
                matchedSectionIDs.insert(card.sectionID)
                score += 1
                feedback = "Match."
                if let section = sourceSections.first(where: { $0.id == card.sectionID }) {
                    _ = appState.recordCodePracticeResult(
                        codeSet: section.codeSet,
                        sectionNumber: section.sectionNumber,
                        wasCorrect: true
                    )
                }

                if matchedSectionIDs.count == 3 {
                    appState.progress.gamesPlayed += 1
                    feedback = "Round complete. Loading next 6 cards..."
                    lockInput = true
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.55) {
                        if sessionActive {
                            generateRound()
                        }
                    }
                }
            } else {
                lockInput = true
                feedback = "Not a match."
                if let firstSection = sourceSections.first(where: { $0.id == first.sectionID }) {
                    _ = appState.recordCodePracticeResult(
                        codeSet: firstSection.codeSet,
                        sectionNumber: firstSection.sectionNumber,
                        wasCorrect: false
                    )
                }
                if let secondSection = sourceSections.first(where: { $0.id == card.sectionID }) {
                    _ = appState.recordCodePracticeResult(
                        codeSet: secondSection.codeSet,
                        sectionNumber: secondSection.sectionNumber,
                        wasCorrect: false
                    )
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
                    lockInput = false
                }
            }
            self.selectedCardID = nil
        } else {
            selectedCardID = card.id
        }
    }

    private func cardBackground(_ card: MatchingCard) -> Color {
        if matchedSectionIDs.contains(card.sectionID) {
            return AppTheme.mint.opacity(0.35)
        }
        if selectedCardID == card.id {
            return AppTheme.sky.opacity(0.4)
        }
        return AppTheme.slate.opacity(0.72)
    }

    private func borderColor(_ card: MatchingCard) -> Color {
        if matchedSectionIDs.contains(card.sectionID) {
            return .green.opacity(0.9)
        }
        if selectedCardID == card.id {
            return AppTheme.sky.opacity(0.95)
        }
        return .white.opacity(0.16)
    }

    private func codeSetFromScope(_ scope: MatchScope) -> CodeSet? {
        switch scope {
        case .penal: return .penal
        case .healthSafety: return .healthSafety
        case .vehicle: return .vehicle
        case .all: return nil
        }
    }
}

private struct MatchingCard: Identifiable, Hashable {
    enum Kind {
        case code
        case definition
    }

    let id: UUID
    let sectionID: UUID
    let text: String
    let kind: Kind
}

private struct MatchingCardTile: View {
    let card: MatchingCard
    let cardHeight: CGFloat
    let background: Color
    let border: Color

    var body: some View {
        let cardFont: Font = card.kind == .code ? .headline.bold() : .subheadline.weight(.semibold)
        return VStack(alignment: .leading, spacing: 8) {
            Text(card.kind == .code ? "Penal Code" : "Definition")
                .font(.caption2.bold())
                .foregroundStyle(.white.opacity(0.7))
            Text(card.text)
                .font(cardFont)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, alignment: .leading)
                .lineLimit(4)
                .minimumScaleFactor(0.68)
        }
        .padding(12)
        .frame(maxWidth: .infinity, minHeight: cardHeight, maxHeight: cardHeight, alignment: .topLeading)
        .background(background)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(border, lineWidth: 1.2)
        )
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

struct RapidFireGameView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var activeQuestion: QuizQuestion?
    @State private var timeRemaining = 30
    @State private var score = 0
    @State private var timerStarted = false
    @State private var gameOver = false
    @State private var recentSectionKeys: [String] = []

    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        VStack(spacing: 14) {
            Text("Rapid Fire")
                .font(.title2.bold())
                .foregroundStyle(.white)
            Text("Answer as many as possible in 30 seconds.")
                .foregroundStyle(.white.opacity(0.8))

            Text("Time: \(timeRemaining)s   Score: \(score)")
                .foregroundStyle(.white)
                .cardContainer()

            if let activeQuestion {
                Text(activeQuestion.prompt)
                    .foregroundStyle(.white)
                    .cardContainer()
                ForEach(activeQuestion.choices.indices, id: \.self) { index in
                    Button(activeQuestion.choices[index]) {
                        answer(index)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(AppTheme.slate.opacity(0.85))
                    .disabled(gameOver)
                }
            }

            Button(gameOver ? "Play Again" : "Start") {
                resetGame()
            }
            .buttonStyle(.borderedProminent)
            .tint(AppTheme.sky)
        }
        .padding()
        .appScreenBackground()
        .navigationTitle("Rapid Fire")
        .navigationBarTitleDisplayMode(.inline)
        .onReceive(timer) { _ in
            guard timerStarted, !gameOver else { return }
            if timeRemaining > 0 {
                timeRemaining -= 1
            } else {
                endGame()
            }
        }
        .onAppear {
            if activeQuestion == nil {
                loadQuestion()
            }
        }
        .overlay {
            if gameOver {
                GameOverLeaderboardView(
                    gameType: .rapidFire,
                    codeSet: nil,
                    duration: 30,
                    score: score,
                    correctAnswers: score,
                    totalQuestions: score + 5,
                    onPlayAgain: {
                        resetGame()
                    },
                    onExit: {
                        dismiss()
                    }
                )
            }
        }
    }
    
    private func endGame() {
        gameOver = true
        timerStarted = false
        appState.progress.gamesPlayed += 1
        appState.recordHighScore(score, for: .rapidFire)
    }

    private func resetGame() {
        score = 0
        timeRemaining = 30
        gameOver = false
        timerStarted = true
        recentSectionKeys.removeAll()
        loadQuestion()
    }

    private func loadQuestion() {
        let questions = appState.repository.questions
        guard !questions.isEmpty else {
            activeQuestion = nil
            return
        }

        let recentSet = Set(recentSectionKeys.suffix(6))
        var candidatePool = questions.filter {
            !recentSet.contains(sectionKey(for: $0)) && $0.id != activeQuestion?.id
        }
        if candidatePool.isEmpty {
            candidatePool = questions.filter { $0.id != activeQuestion?.id }
        }
        let next = candidatePool.randomElement() ?? questions.randomElement()
        activeQuestion = next

        if let next {
            recentSectionKeys.append(sectionKey(for: next))
            if recentSectionKeys.count > 12 {
                recentSectionKeys.removeFirst(recentSectionKeys.count - 12)
            }
        }
    }

    private func answer(_ index: Int) {
        guard let activeQuestion, !gameOver else { return }
        if index == activeQuestion.correctIndex {
            score += 1
        }
        loadQuestion()
        timerStarted = true
    }

    private func sectionKey(for question: QuizQuestion) -> String {
        "\(question.codeSet.rawValue)|\(question.linkedSectionNumber.lowercased())"
    }
}

struct BlasterGameView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var currentSection: CodeSection?
    @State private var choices: [String] = []
    @State private var score = 0
    @State private var rounds = 0
    @State private var showGameOver = false

    var body: some View {
        ZStack {
            VStack(spacing: 16) {
                Text("Blaster")
                    .font(.title2.bold())
                    .foregroundStyle(.white)
                Text("Tag the correct section title quickly.")
                    .foregroundStyle(.white.opacity(0.8))

                if let currentSection {
                    Text(currentSection.sectionNumber)
                        .font(.largeTitle.bold())
                        .foregroundStyle(.white)
                        .cardContainer()

                    ForEach(choices, id: \.self) { choice in
                        Button(choice) {
                            if choice == currentSection.title {
                                score += 1
                            }
                            rounds += 1
                            if rounds >= 10 {
                                endGame()
                            } else {
                                nextRound()
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(AppTheme.mint.opacity(0.75))
                    }
                }

                Text("Score: \(score) / Round: \(rounds)/10")
                    .foregroundStyle(.white.opacity(0.9))
            }
            .padding()
            .appScreenBackground()
            
            if showGameOver {
                GameOverLeaderboardView(
                    gameType: .blaster,
                    codeSet: nil,
                    duration: rounds * 5,
                    score: score * 10,
                    correctAnswers: score,
                    totalQuestions: 10,
                    onPlayAgain: {
                        resetGame()
                    },
                    onExit: {
                        dismiss()
                    }
                )
            }
        }
        .navigationTitle("Blaster")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { 
            if currentSection == nil {
                nextRound()
            }
        }
    }
    
    private func endGame() {
        showGameOver = true
        appState.progress.gamesPlayed += 1
        appState.recordHighScore(score, for: .blaster)
    }
    
    private func resetGame() {
        score = 0
        rounds = 0
        showGameOver = false
        nextRound()
    }

    private func nextRound() {
        let source = appState.repository.sections
        guard source.count >= 4 else { return }
        currentSection = source.randomElement()
        guard let currentSection else { return }
        let distractors = source.filter { $0.id != currentSection.id }.shuffled().prefix(3).map(\.title)
        choices = ([currentSection.title] + distractors).shuffled()
    }
}

struct CaseFileGameView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var currentIndex = 0
    @State private var score = 0
    @State private var completed = false
    @State private var sessionScenarios: [Scenario] = []

    var body: some View {
        ZStack {
            VStack(spacing: 14) {
                Text("Case File")
                    .font(.title2.bold())
                    .foregroundStyle(.white)

                if !completed {
                    let scenario = sessionScenarios[min(currentIndex, max(0, sessionScenarios.count - 1))]
                    Text(scenario.title)
                        .foregroundStyle(.white)
                        .cardContainer()
                    Text(scenario.summary)
                        .foregroundStyle(.white.opacity(0.85))

                    ForEach(scenario.decisions.indices, id: \.self) { idx in
                        Button(scenario.decisions[idx]) {
                            if idx == scenario.bestDecisionIndex {
                                score += 1
                            }
                            currentIndex += 1
                            if currentIndex >= min(3, sessionScenarios.count) {
                                endGame()
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(AppTheme.slate.opacity(0.85))
                    }
                    
                    Text("Progress: \(currentIndex + 1)/\(min(3, sessionScenarios.count))")
                        .foregroundStyle(.white.opacity(0.6))
                }
            }
            .padding()
            .appScreenBackground()
            
            if completed {
                GameOverLeaderboardView(
                    gameType: .caseFile,
                    codeSet: nil,
                    duration: currentIndex * 30,
                    score: score * 33,
                    correctAnswers: score,
                    totalQuestions: min(3, sessionScenarios.count),
                    onPlayAgain: {
                        resetGame()
                    },
                    onExit: {
                        dismiss()
                    }
                )
            }
        }
        .navigationTitle("Case File")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            if sessionScenarios.isEmpty {
                sessionScenarios = appState.repository.scenarios.shuffled()
            }
        }
    }
    
    private func endGame() {
        completed = true
        appState.progress.gamesPlayed += 1
        appState.recordHighScore(score, for: .caseFile)
    }
    
    private func resetGame() {
        currentIndex = 0
        score = 0
        completed = false
        sessionScenarios = appState.repository.scenarios.shuffled()
    }
}

struct GlobalLeaderboardView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var leaderboardStore = LeaderboardStore()
    @State private var usernameDraft = ""
    private let miniGames: [GameType] = [.matching, .rapidFire, .gravity, .blaster, .caseFile]

    var body: some View {
        List {
            Section("Account") {
                if appState.isSignedIn {
                    HStack {
                        Text("Signed in with \(appState.authProvider?.rawValue ?? "")")
                            .foregroundStyle(.white.opacity(0.85))
                        Spacer()
                        Button("Sign Out") {
                            appState.signOut()
                        }
                        .buttonStyle(.bordered)
                        .tint(.white)
                    }

                    TextField("Username", text: $usernameDraft)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled(true)
                        .padding(10)
                        .background(AppTheme.slate.opacity(0.75))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .foregroundStyle(.white)
                        .onChange(of: usernameDraft) {
                            appState.currentPlayerName = usernameDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                        }
                } else {
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
                                usernameDraft = appState.currentPlayerName
                            }
                        case .failure:
                            break
                        }
                    }
                    .signInWithAppleButtonStyle(.whiteOutline)
                    .frame(height: 44)

                    Button {
                        appState.signIn(
                            provider: .google,
                            userIdentifier: UUID().uuidString,
                            suggestedName: nil
                        )
                        usernameDraft = appState.currentPlayerName
                    } label: {
                        HStack {
                            Image(systemName: "globe")
                            Text("Continue with Google")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(AppTheme.sky)
                    .frame(height: 44)
                }
            }
            .listRowBackground(Color.white.opacity(0.08))

            ForEach(miniGames, id: \.self) { game in
                Section(game.rawValue) {
                    let gameEntries = entries(for: game)
                    if gameEntries.isEmpty {
                        Text("No scores yet")
                            .foregroundStyle(.white.opacity(0.65))
                    } else {
                        ForEach(gameEntries) { entry in
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(entry.playerName)
                                        .foregroundStyle(.white)
                                    Spacer()
                                    Text("\(entry.score)")
                                        .font(.headline)
                                        .foregroundStyle(.white.opacity(0.95))
                                }
                                Text("\(entry.correctAnswers)/\(entry.totalQuestions) • \(entry.duration)s")
                                    .font(.caption)
                                    .foregroundStyle(.white.opacity(0.68))
                            }
                        }
                    }
                }
                .listRowBackground(Color.white.opacity(0.08))
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .appScreenBackground()
        .navigationTitle("Leaderboard")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            leaderboardStore.loadLeaderboard(limit: 50)
            usernameDraft = appState.currentPlayerName
        }
    }

    private func entries(for game: GameType) -> [LeaderboardEntry] {
        Array(leaderboardStore.entries.filter { $0.gameType == game }.prefix(10))
    }
}

struct GravityGameView: View {
    enum GravityScope: String, CaseIterable, Identifiable {
        case penal = "Penal"
        case healthSafety = "HS"
        case vehicle = "Vehicle"
        case all = "All"

        var id: String { rawValue }
    }

    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var selectedScope: GravityScope = .penal
    @State private var selectedDuration: Int = 30
    @State private var sessionActive = false
    @State private var sessionEnded = false
    @State private var timeRemaining = 30
    @State private var score = 0
    @State private var totalQuestions = 0
    @State private var currentSection: CodeSection?
    @State private var currentAnswerNumber = ""
    @State private var promptStartDate = Date()
    @State private var promptFallDuration: Double = 3.6
    @State private var input = ""
    @State private var shuffledSectionIDs: [UUID] = []
    @State private var sectionCursor = 0
    @State private var sectionPoolSignature = ""
    @State private var recentSectionIDs: [UUID] = []

    private let secondTimer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
    private let frameTimer = Timer.publish(every: 0.1, on: .main, in: .common).autoconnect()

    private var sourceSections: [CodeSection] {
        switch selectedScope {
        case .penal:
            return appState.repository.sections.filter { $0.codeSet == .penal }
        case .healthSafety:
            return appState.repository.sections.filter { $0.codeSet == .healthSafety }
        case .vehicle:
            return appState.repository.sections.filter { $0.codeSet == .vehicle }
        case .all:
            return appState.repository.sections
        }
    }

    private var fallProgress: CGFloat {
        guard sessionActive else { return 0 }
        let elapsed = Date().timeIntervalSince(promptStartDate)
        return min(1, max(0, elapsed / promptFallDuration))
    }

    var body: some View {
        GeometryReader { geo in
            VStack(spacing: 14) {
                Text("Gravity")
                    .font(.title2.bold())
                    .foregroundStyle(.white)
                Text("Definitions fall from the sky. Type only the code number.")
                    .foregroundStyle(.white.opacity(0.8))

                VStack(spacing: 10) {
                    Picker("Codes", selection: $selectedScope) {
                        ForEach(GravityScope.allCases) { scope in
                            Text(scope.rawValue).tag(scope)
                        }
                    }
                    .pickerStyle(.segmented)
                    .disabled(sessionActive)

                    Picker("Duration", selection: $selectedDuration) {
                        Text("15s").tag(15)
                        Text("30s").tag(30)
                        Text("60s").tag(60)
                    }
                    .pickerStyle(.segmented)
                    .disabled(sessionActive)

                    HStack {
                        Text("Time: \(timeRemaining)s")
                        Spacer()
                        Text("Score: \(score)")
                        Spacer()
                        Text("Questions: \(totalQuestions)")
                    }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.9))

                    Button(sessionActive ? "Running..." : "Start Gravity") {
                        startSession()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(AppTheme.sky)
                    .disabled(sessionActive)
                }
                .cardContainer()

                ZStack(alignment: .top) {
                    RoundedRectangle(cornerRadius: 14)
                        .fill(AppTheme.slate.opacity(0.55))
                        .overlay(
                            RoundedRectangle(cornerRadius: 14)
                                .stroke(Color.white.opacity(0.14), lineWidth: 1)
                        )

                    if let section = currentSection {
                        Text(section.title)
                            .font(.headline.bold())
                            .foregroundStyle(.white)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 12)
                            .frame(maxWidth: .infinity)
                            .offset(y: 12 + fallProgress * max(20, geo.size.height * 0.2))
                            .animation(.linear(duration: 0.08), value: fallProgress)
                    } else {
                        Text("Tap Start Gravity")
                            .foregroundStyle(.white.opacity(0.65))
                            .padding(.top, 18)
                    }
                }
                .frame(height: 180)

                HStack(spacing: 8) {
                    Text(currentPrefix)
                        .font(.title3.bold())
                        .foregroundStyle(.white.opacity(0.9))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .background(AppTheme.slate.opacity(0.7))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    TextField("Type number only", text: $input)
                        .keyboardType(.numberPad)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled(true)
                        .padding(12)
                        .background(AppTheme.slate.opacity(0.7))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .foregroundStyle(.white)
                        .disabled(!sessionActive || currentSection == nil)
                }

                Button("Submit") {
                    submit()
                }
                .buttonStyle(.borderedProminent)
                .tint(AppTheme.sky)
                .disabled(!sessionActive || currentSection == nil)

                Spacer(minLength: 0)
            }
            .padding()
        }
        .appScreenBackground()
        .navigationTitle("Gravity")
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: selectedScope) {
            resetDeckState()
        }
        .onReceive(secondTimer) { _ in
            guard sessionActive else { return }
            if timeRemaining > 0 {
                timeRemaining -= 1
            } else {
                endSession()
            }
        }
        .onReceive(frameTimer) { _ in
            guard sessionActive, currentSection != nil else { return }
            if fallProgress >= 1 {
                totalQuestions += 1
                input = ""
                nextPrompt()
            }
        }
        .overlay {
            if sessionEnded {
                GameOverLeaderboardView(
                    gameType: .gravity,
                    codeSet: selectedCodeSetOrNil,
                    duration: selectedDuration,
                    score: score,
                    correctAnswers: score,
                    totalQuestions: max(1, totalQuestions),
                    onPlayAgain: reset,
                    onExit: { dismiss() }
                )
            }
        }
    }

    private func submit() {
        guard sessionActive, currentSection != nil else { return }
        let normalized = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if normalized == currentAnswerNumber {
            score += 1
        }
        totalQuestions += 1
        input = ""
        nextPrompt()
    }

    private func nextPrompt() {
        guard let nextSection = drawNextSection() else {
            currentSection = nil
            return
        }
        currentSection = nextSection
        currentAnswerNumber = numericPart(from: nextSection.sectionNumber)
        promptStartDate = Date()
        promptFallDuration = max(2.4, 4.0 - Double(score / 6) * 0.15)
    }

    private func reset() {
        score = 0
        totalQuestions = 0
        sessionEnded = false
        timeRemaining = selectedDuration
        sessionActive = true
        input = ""
        resetDeckState()
        nextPrompt()
    }

    private func startSession() {
        score = 0
        totalQuestions = 0
        timeRemaining = selectedDuration
        sessionEnded = false
        sessionActive = true
        input = ""
        resetDeckState()
        nextPrompt()
    }

    private func endSession() {
        sessionActive = false
        sessionEnded = true
        appState.progress.gamesPlayed += 1
        appState.recordHighScore(score, for: .gravity)
    }

    private var currentPrefix: String {
        guard let currentSection else { return "Code" }
        if currentSection.sectionNumber.uppercased().hasPrefix("PC") { return "PC" }
        if currentSection.sectionNumber.uppercased().hasPrefix("VC") { return "VC" }
        if currentSection.sectionNumber.uppercased().hasPrefix("HS") { return "HS" }
        return "Code"
    }

    private var selectedCodeSetOrNil: CodeSet? {
        switch selectedScope {
        case .penal: return .penal
        case .healthSafety: return .healthSafety
        case .vehicle: return .vehicle
        case .all: return nil
        }
    }

    private func numericPart(from sectionNumber: String) -> String {
        var current = ""
        for char in sectionNumber {
            if char.isNumber {
                current.append(char)
            } else if !current.isEmpty {
                return current
            }
        }
        return current
    }

    private func resetDeckState() {
        shuffledSectionIDs = []
        sectionCursor = 0
        sectionPoolSignature = ""
        recentSectionIDs.removeAll()
    }

    private func drawNextSection() -> CodeSection? {
        let sections = sourceSections
        guard !sections.isEmpty else { return nil }
        prepareDeckIfNeeded(with: sections)
        if sectionCursor >= shuffledSectionIDs.count {
            reshuffleDeck(with: sections)
        }
        guard sectionCursor < shuffledSectionIDs.count else { return sections.randomElement() }
        let id = shuffledSectionIDs[sectionCursor]
        sectionCursor += 1
        let section = sections.first { $0.id == id } ?? sections.randomElement()
        if let section {
            recentSectionIDs.append(section.id)
            if recentSectionIDs.count > 14 {
                recentSectionIDs.removeFirst(recentSectionIDs.count - 14)
            }
        }
        return section
    }

    private func prepareDeckIfNeeded(with sections: [CodeSection]) {
        let signature = sections.map(\.id.uuidString).sorted().joined(separator: "|")
        if signature != sectionPoolSignature || shuffledSectionIDs.isEmpty {
            sectionPoolSignature = signature
            reshuffleDeck(with: sections)
        }
    }

    private func reshuffleDeck(with sections: [CodeSection]) {
        var ids = sections.map(\.id).shuffled()
        let recentSet = Set(recentSectionIDs.suffix(10))
        if !recentSet.isEmpty {
            let nonRecent = ids.filter { !recentSet.contains($0) }
            let recent = ids.filter { recentSet.contains($0) }
            ids = nonRecent + recent
        }
        shuffledSectionIDs = ids
        sectionCursor = 0
    }
}

struct GameOverLeaderboardView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var leaderboardStore = LeaderboardStore()
    @State private var hasSubmitted = false

    let gameType: GameType
    let codeSet: CodeSet?
    let duration: Int
    let score: Int
    let correctAnswers: Int
    let totalQuestions: Int
    let onPlayAgain: () -> Void
    let onExit: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.35).ignoresSafeArea()
            VStack(spacing: 10) {
                Text("\(gameType.rawValue) Complete")
                    .font(.title3.bold())
                    .foregroundStyle(.white)
                Text("Score: \(score)")
                    .font(.headline)
                    .foregroundStyle(.white)
                Text("Correct: \(correctAnswers)/\(max(1, totalQuestions))")
                    .foregroundStyle(.white.opacity(0.85))
                Text("Time: \(duration)s")
                    .foregroundStyle(.white.opacity(0.85))
                if let codeSet {
                    Text(codeSet.rawValue)
                        .font(.caption.bold())
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(AppTheme.mint.opacity(0.25))
                        .clipShape(Capsule())
                        .foregroundStyle(.white)
                }
                HStack(spacing: 10) {
                    Button("Replay", action: onPlayAgain)
                        .buttonStyle(.borderedProminent)
                        .tint(AppTheme.sky)
                    Button("Exit", action: onExit)
                        .buttonStyle(.bordered)
                        .tint(.white)
                }
            }
            .padding(16)
            .frame(maxWidth: 340)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(AppTheme.slate.opacity(0.95))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(Color.white.opacity(0.16), lineWidth: 1)
                    )
            )
            .shadow(color: .black.opacity(0.3), radius: 14, y: 8)
        }
        .onAppear {
            guard appState.isSignedIn, !hasSubmitted else { return }
            let username = appState.currentPlayerName.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !username.isEmpty else { return }
            leaderboardStore.submitScore(
                playerName: username,
                gameType: gameType,
                codeSet: codeSet,
                duration: duration,
                score: score,
                correct: correctAnswers,
                total: totalQuestions
            )
            hasSubmitted = true
        }
    }
}
