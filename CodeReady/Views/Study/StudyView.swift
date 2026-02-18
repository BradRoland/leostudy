import SwiftUI

struct StudyView: View {
    enum StudyCodeFilter: String, CaseIterable, Identifiable {
        case all = "All"
        case penal = "Penal"
        case healthSafety = "HS"
        case vehicle = "Vehicle"

        var id: String { rawValue }
    }

    @EnvironmentObject private var appState: AppState
    @State private var studyFilter: StudyCodeFilter = .all
    @State private var selectedQuestion: QuizQuestion?
    @State private var selectedChoiceIndex: Int?
    @State private var showExplanation = false
    @State private var currentFlashcardIndex = 0
    @State private var isFlashcardFlipped = false
    @State private var lastAnswerWasCorrect: Bool?
    @State private var streakCount = 0
    @State private var bestStreak = 0
    @State private var recentQuestionIDs: [UUID] = []
    @State private var recentSectionKeys: [String] = []
    @State private var shuffledSectionKeys: [String] = []
    @State private var sectionCursor = 0
    @State private var questionPoolSignature = ""
    @State private var streakPulse = false
    @State private var masteredBannerText: String?
    @State private var masteredBannerToken = 0
    
    private var fireLevel: Int {
        switch streakCount {
        case 30...: return 6
        case 25...: return 5
        case 20...: return 4
        case 15...: return 3
        case 10...: return 2
        case 5...: return 1
        default: return 0
        }
    }

    private var filteredQuestions: [QuizQuestion] {
        appState.repository.questions.filter { matchFilter($0.codeSet) }
    }

    private var filteredFlashcards: [Flashcard] {
        appState.repository.flashcards.filter { matchFilter($0.codeSet) }
    }

    private var safeFlashcardIndex: Int {
        guard !filteredFlashcards.isEmpty else { return 0 }
        return min(max(0, currentFlashcardIndex), filteredFlashcards.count - 1)
    }

    var body: some View {
        List {
            Section {
                Picker("Study Filter", selection: $studyFilter) {
                    ForEach(StudyCodeFilter.allCases) { filter in
                        Text(filter.rawValue).tag(filter)
                    }
                }
                .pickerStyle(.segmented)

                Text("\(filteredQuestions.count) questions • \(filteredFlashcards.count) flashcards")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.72))
            }
            .listRowBackground(Color.clear)

            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Quick Quiz")
                        .font(.title3.bold())
                        .foregroundStyle(.white.opacity(0.95))

                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Spacer()
                            Text("Best: \(bestStreak)")
                                .font(.caption.bold())
                                .padding(.horizontal, 9)
                                .padding(.vertical, 6)
                                .background(AppTheme.mint.opacity(0.32))
                                .clipShape(Capsule())
                                .foregroundStyle(.white)
                        }

                        if let question = selectedQuestion {
                            Text(question.prompt)
                                .font(.headline)
                                .foregroundStyle(.white)
                                .padding(.top, fireLevel > 0 ? 8 : 0)

                            ForEach(question.choices.indices, id: \.self) { index in
                                Button {
                                    guard !showExplanation else { return }
                                    handleQuizAnswerSelection(index: index, question: question)
                                } label: {
                                    HStack {
                                        Text(question.choices[index])
                                            .foregroundStyle(.white)
                                        Spacer()
                                        if showExplanation && index == question.correctIndex {
                                            Image(systemName: "checkmark.circle.fill")
                                                .foregroundStyle(.green)
                                        } else if showExplanation && selectedChoiceIndex == index && index != question.correctIndex {
                                            Image(systemName: "xmark.circle.fill")
                                                .foregroundStyle(.red)
                                        }
                                    }
                                }
                                .buttonStyle(.borderedProminent)
                                .tint(AppTheme.slate.opacity(0.75))
                            }

                            if showExplanation {
                                if let lastAnswerWasCorrect {
                                    Text(lastAnswerWasCorrect ? "Correct answer." : "Not quite. Review and keep going.")
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(lastAnswerWasCorrect ? .green : .orange)
                                }
                                Text(question.explanation)
                                    .font(.subheadline)
                                    .foregroundStyle(.white.opacity(0.8))

                                Button("Next Question") {
                                    loadRandomQuestion()
                                }
                                .buttonStyle(.borderedProminent)
                                .tint(AppTheme.sky)
                            }
                        } else {
                            Button("Start Quick Quiz") {
                                loadRandomQuestion()
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(AppTheme.sky)
                        }
                    }
                    .padding(14)
                    .background(
                        RoundedRectangle(cornerRadius: 16)
                            .fill(AppTheme.slate.opacity(0.34))
                            .overlay(
                                RoundedRectangle(cornerRadius: 16)
                                    .stroke(Color.white.opacity(0.12), lineWidth: 1)
                            )
                    )
                }
            }
            .listRowBackground(Color.clear)

            Section {
                if filteredFlashcards.isEmpty {
                    Text("No flashcards available for this code set yet.")
                        .foregroundStyle(.white.opacity(0.85))
                } else {
                    let card = filteredFlashcards[safeFlashcardIndex]
                    FlashcardFlipView(
                        frontText: card.front,
                        backText: card.back,
                        isFlipped: isFlashcardFlipped
                    )
                    .onTapGesture {
                        withAnimation(.spring(response: 0.45, dampingFraction: 0.82)) {
                            isFlashcardFlipped.toggle()
                        }
                        appState.progress.flashcardsReviewed += 1
                    }

                    HStack {
                        Button("Previous") {
                            previousFlashcard()
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(AppTheme.slate.opacity(0.85))

                        Spacer()

                        Text("\(safeFlashcardIndex + 1) / \(filteredFlashcards.count)")
                            .font(.footnote)
                            .foregroundStyle(.white.opacity(0.8))

                        Spacer()

                        Button("Next") {
                            nextFlashcard()
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(AppTheme.sky)
                    }
                }
            } header: {
                Text("Flashcards")
                    .foregroundStyle(.white.opacity(0.9))
            }
            .listRowBackground(Color.white.opacity(0.08))
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .appScreenBackground()
        .tint(AppTheme.sky)
        .navigationTitle("Study")
        .overlay(alignment: .top) {
            if let masteredBannerText {
                MasteredCodeBanner(text: masteredBannerText)
                    .id(masteredBannerToken)
                    .padding(.top, 58)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .overlay(alignment: .top) {
            if fireLevel > 0 {
                ScreenTopFireOverlay(level: fireLevel, pulse: streakPulse)
                    .frame(height: 220)
                    .ignoresSafeArea(edges: .top)
                    .offset(y: -84)
                    .allowsHitTesting(false)
            }
        }
        .overlay {
            if fireLevel >= 5 {
                FullScreenFireOverlay(level: fireLevel)
                    .ignoresSafeArea()
                    .allowsHitTesting(false)
                    .transition(.opacity)
            }
        }
        .onAppear {
            if selectedQuestion == nil {
                loadRandomQuestion()
            }
            currentFlashcardIndex = 0
            isFlashcardFlipped = false
        }
        .onChange(of: studyFilter) {
            recentQuestionIDs.removeAll()
            recentSectionKeys.removeAll()
            shuffledSectionKeys.removeAll()
            sectionCursor = 0
            questionPoolSignature = ""
            loadRandomQuestion()
            currentFlashcardIndex = 0
            isFlashcardFlipped = false
        }
    }

    private func loadRandomQuestion() {
        let pool = filteredQuestions.isEmpty ? appState.repository.questions : filteredQuestions
        guard !pool.isEmpty else {
            selectedQuestion = nil
            selectedChoiceIndex = nil
            showExplanation = false
            lastAnswerWasCorrect = nil
            return
        }

        let groupedBySection = Dictionary(grouping: pool, by: sectionKey(for:))
        let sectionKeys = groupedBySection.keys.sorted()
        prepareQuestionOrderIfNeeded(for: sectionKeys)
        if sectionCursor >= shuffledSectionKeys.count {
            reshuffleQuestionOrder(for: sectionKeys)
        }

        var nextQuestion: QuizQuestion?
        if sectionCursor < shuffledSectionKeys.count {
            let nextSectionKey = shuffledSectionKeys[sectionCursor]
            sectionCursor += 1
            let candidates = groupedBySection[nextSectionKey] ?? []
            let recentQuestionSet = Set(recentQuestionIDs.suffix(6))
            nextQuestion =
                candidates.filter { $0.id != selectedQuestion?.id && !recentQuestionSet.contains($0.id) }.randomElement()
                ?? candidates.filter { $0.id != selectedQuestion?.id }.randomElement()
                ?? candidates.randomElement()
        }

        if nextQuestion == nil {
            nextQuestion = pool.randomElement()
        }

        selectedQuestion = nextQuestion
        if let questionID = nextQuestion?.id {
            recentQuestionIDs.append(questionID)
            if recentQuestionIDs.count > 12 {
                recentQuestionIDs.removeFirst(recentQuestionIDs.count - 12)
            }
        }
        if let nextQuestion {
            recentSectionKeys.append(sectionKey(for: nextQuestion))
            if recentSectionKeys.count > 12 {
                recentSectionKeys.removeFirst(recentSectionKeys.count - 12)
            }
        }
        selectedChoiceIndex = nil
        showExplanation = false
        lastAnswerWasCorrect = nil
    }

    private func prepareQuestionOrderIfNeeded(for sectionKeys: [String]) {
        let signature = sectionKeys.joined(separator: "|")
        if signature != questionPoolSignature || shuffledSectionKeys.isEmpty {
            questionPoolSignature = signature
            reshuffleQuestionOrder(for: sectionKeys)
        }
    }

    private func reshuffleQuestionOrder(for sectionKeys: [String]) {
        var keys = sectionKeys.shuffled()
        let recentSet = Set(recentSectionKeys.suffix(8))
        if !recentSet.isEmpty {
            let nonRecent = keys.filter { !recentSet.contains($0) }
            let recent = keys.filter { recentSet.contains($0) }
            keys = nonRecent + recent
        }
        shuffledSectionKeys = keys
        sectionCursor = 0
    }

    private func sectionKey(for question: QuizQuestion) -> String {
        "\(question.codeSet.rawValue)|\(question.linkedSectionNumber.lowercased())"
    }

    private func nextFlashcard() {
        guard !filteredFlashcards.isEmpty else { return }
        currentFlashcardIndex = (safeFlashcardIndex + 1) % filteredFlashcards.count
        withAnimation(.easeInOut(duration: 0.2)) {
            isFlashcardFlipped = false
        }
    }

    private func previousFlashcard() {
        guard !filteredFlashcards.isEmpty else { return }
        currentFlashcardIndex = (safeFlashcardIndex - 1 + filteredFlashcards.count) % filteredFlashcards.count
        withAnimation(.easeInOut(duration: 0.2)) {
            isFlashcardFlipped = false
        }
    }

    private func matchFilter(_ codeSet: CodeSet) -> Bool {
        switch studyFilter {
        case .all:
            return true
        case .penal:
            return codeSet == .penal
        case .healthSafety:
            return codeSet == .healthSafety
        case .vehicle:
            return codeSet == .vehicle
        }
    }

    private func handleQuizAnswerSelection(index: Int, question: QuizQuestion) {
        selectedChoiceIndex = index
        showExplanation = true
        let correct = index == question.correctIndex
        lastAnswerWasCorrect = correct
        appState.progress.quizzesCompleted += 1
        let justMasteredPenal = appState.recordQuizResult(question: question, wasCorrect: correct)

        if correct {
            streakCount += 1
            bestStreak = max(bestStreak, streakCount)
            streakPulse = true

            if justMasteredPenal {
                masteredBannerToken += 1
                masteredBannerText = "Mastered \(question.linkedSectionNumber)"
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.2) {
                    masteredBannerText = nil
                }
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                streakPulse = false
            }
        } else {
            streakCount = 0
            streakPulse = false
        }
    }
}

private struct FlashcardFlipView: View {
    let frontText: String
    let backText: String
    let isFlipped: Bool

    var body: some View {
        ZStack {
            flashcardFace(title: "Prompt", text: frontText)
                .opacity(isFlipped ? 0 : 1)
                .rotation3DEffect(.degrees(isFlipped ? -180 : 0), axis: (x: 0, y: 1, z: 0))

            flashcardFace(title: "Answer", text: backText)
                .opacity(isFlipped ? 1 : 0)
                .rotation3DEffect(.degrees(isFlipped ? 0 : 180), axis: (x: 0, y: 1, z: 0))
        }
        .animation(.spring(response: 0.45, dampingFraction: 0.82), value: isFlipped)
    }

    private func flashcardFace(title: String, text: String) -> some View {
        Group {
            if title == "Prompt" {
                Text(text)
                    .font(.system(size: 42, weight: .heavy, design: .rounded))
                    .minimumScaleFactor(0.35)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .padding(20)
            } else {
                Text(text)
                    .font(.title3.bold())
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .padding(20)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 210, alignment: .center)
        .background(AppTheme.slate.opacity(0.55))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.white.opacity(0.16), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .contentShape(RoundedRectangle(cornerRadius: 12))
    }
}

private struct ScreenTopFireOverlay: View {
    let level: Int
    let pulse: Bool

    private var intensity: CGFloat {
        min(0.72, 0.18 + CGFloat(level) * 0.08)
    }

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
            let time = timeline.date.timeIntervalSinceReferenceDate
            GeometryReader { geo in
                let particles = makeParticles(time: time, width: geo.size.width)
                ZStack(alignment: .topLeading) {
                    ForEach(particles) { particle in
                        FlameEmojiView(
                            size: particle.size,
                            alpha: particle.alpha,
                            x: particle.x,
                            y: particle.y
                        )
                    }
                }
                .clipped()
            }
        }
        .opacity(pulse ? 0.72 : 0.58)
        .scaleEffect(pulse ? 1.03 : 1.0, anchor: .top)
    }

    private func makeParticles(time: TimeInterval, width: CGFloat) -> [FlameParticle] {
        let count = max(1, 14 + level * 7)
        let countCGFloat = CGFloat(count)
        let usableWidth = max(1, width - 16)
        var particles: [FlameParticle] = []
        particles.reserveCapacity(count)

        for index in 0..<count {
            let speed = 0.58 + Double(index % 6) * 0.07 + Double(level) * 0.02
            let progress = (time * speed + Double(index) * 0.11).truncatingRemainder(dividingBy: 1.0)
            let xBase = 8 + usableWidth * (CGFloat(index) + 0.5) / countCGFloat
            let sway = CGFloat(sin(time * 2.4 + Double(index) * 0.7)) * (1.8 + CGFloat(level) * 0.9)
            let y = CGFloat(progress) * (54 + CGFloat(level) * 20)
            let size = (10 + CGFloat(index % 4) * 2 + CGFloat(level) * 1.6) * (1.0 - 0.38 * progress)
            let alpha = (1.0 - progress) * (0.3 + 0.35 * intensity)

            particles.append(
                FlameParticle(
                    id: index,
                    size: max(6, size),
                    alpha: alpha,
                    x: xBase + sway,
                    y: 6 + y
                )
            )
        }

        return particles
    }
}

private struct FlameParticle: Identifiable {
    let id: Int
    let size: CGFloat
    let alpha: CGFloat
    let x: CGFloat
    let y: CGFloat
}

private struct FlameEmojiView: View {
    let size: CGFloat
    let alpha: CGFloat
    let x: CGFloat
    let y: CGFloat

    var body: some View {
        Image(systemName: "flame.fill")
            .font(.system(size: size, weight: .bold))
            .foregroundStyle(
                LinearGradient(
                    colors: [.yellow.opacity(0.95), .orange.opacity(0.95), .red.opacity(0.85)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .shadow(color: .orange.opacity(0.4), radius: 6)
            .opacity(alpha)
            .position(x: x, y: y)
    }
}

private struct MasteredCodeBanner: View {
    let text: String
    @State private var pop = false

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark.seal.fill")
                .foregroundStyle(.yellow)
            Text(text)
                .font(.subheadline.bold())
                .foregroundStyle(.white)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(AppTheme.mint.opacity(0.44))
        .overlay(
            Capsule()
                .stroke(Color.white.opacity(0.35), lineWidth: 1)
        )
        .clipShape(Capsule())
        .scaleEffect(pop ? 1.0 : 0.86)
        .opacity(pop ? 1 : 0)
        .onAppear {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.72)) {
                pop = true
            }
        }
    }
}

private struct FullScreenFireOverlay: View {
    let level: Int

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 24.0)) { timeline in
            let time = timeline.date.timeIntervalSinceReferenceDate
            ZStack {
                VStack {
                    Spacer()
                    LinearGradient(
                        colors: [
                            .clear,
                            .orange.opacity(level >= 6 ? 0.14 : 0.08),
                            .red.opacity(level >= 6 ? 0.2 : 0.12)
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .frame(height: level >= 6 ? 320 : 220)
                }

                if level >= 6 {
                    GeometryReader { geo in
                        ForEach(0..<44, id: \.self) { index in
                            let p = (time * (0.5 + Double(index % 5) * 0.08) + Double(index) * 0.17).truncatingRemainder(dividingBy: 1.0)
                            let x = geo.size.width * (CGFloat((index * 37) % 100) / 100.0)
                            let y = geo.size.height - CGFloat(p) * (geo.size.height * 0.95)
                            Circle()
                                .fill(index.isMultiple(of: 2) ? .orange.opacity(0.35) : .yellow.opacity(0.3))
                                .frame(width: 3 + CGFloat(index % 3), height: 3 + CGFloat(index % 3))
                                .position(x: x, y: y)
                        }
                    }
                }
            }
        }
    }
}
