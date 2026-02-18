import Foundation

struct MockContentRepository {
    private let seedLoader = LocalCaliforniaCodeSeedLoader()

    let sections: [CodeSection]
    let questions: [QuizQuestion]
    let flashcards: [Flashcard]
    let scenarios: [Scenario]

    init() {
        let loadedSections = seedLoader.loadFromBundle()
        sections = loadedSections.isEmpty ? Self.fallbackSections : loadedSections
        questions = Self.generateQuestions(from: sections)
        flashcards = Self.generateFlashcards(from: sections)
        scenarios = Self.defaultScenarios
    }

    private static let fallbackSections: [CodeSection] = [
        CodeSection(
            id: UUID(),
            codeSet: .penal,
            sectionNumber: "PC 148(a)(1)",
            title: "Resisting, delaying, or obstructing an officer",
            text: "Every person who willfully resists, delays, or obstructs any public officer in the discharge or attempt to discharge any duty of office is punishable...",
            tags: ["resistance", "public officer", "misdemeanor"],
            frequentlyTested: true
        ),
        CodeSection(
            id: UUID(),
            codeSet: .penal,
            sectionNumber: "PC 594",
            title: "Vandalism",
            text: "Every person who maliciously commits any of the following acts with respect to any real or personal property not his or her own...",
            tags: ["property crimes", "vandalism"],
            frequentlyTested: false
        ),
        CodeSection(
            id: UUID(),
            codeSet: .vehicle,
            sectionNumber: "VC 23152(a)",
            title: "Driving under the influence",
            text: "It is unlawful for a person who is under the influence of any alcoholic beverage to drive a vehicle.",
            tags: ["dui", "driving", "substances"],
            frequentlyTested: true
        ),
        CodeSection(
            id: UUID(),
            codeSet: .vehicle,
            sectionNumber: "VC 12500(a)",
            title: "Driving without a valid license",
            text: "A person may not drive a motor vehicle upon a highway, unless the person then holds a valid driver's license issued under this code...",
            tags: ["licensing", "traffic stops"],
            frequentlyTested: true
        )
    ]

    private static func generateQuestions(from sections: [CodeSection]) -> [QuizQuestion] {
        var generated: [QuizQuestion] = []

        for section in sections {
            let sameCodeSet = sections.filter { $0.codeSet == section.codeSet && $0.id != section.id }
            let sectionDistractors = Array(sameCodeSet.shuffled().prefix(3)).map(\.sectionNumber)
            if sectionDistractors.count == 3 {
                let sectionChoices = ([section.sectionNumber] + sectionDistractors).shuffled()
                let sectionCorrect = sectionChoices.firstIndex(of: section.sectionNumber) ?? 0
                generated.append(
                    QuizQuestion(
                        id: UUID(),
                        codeSet: section.codeSet,
                        prompt: "Which section number matches: \(section.title)?",
                        choices: sectionChoices,
                        correctIndex: sectionCorrect,
                        explanation: shortExplanation(for: section),
                        linkedSectionNumber: section.sectionNumber,
                        difficulty: section.frequentlyTested ? .basic : .intermediate
                    )
                )
            }

            let titleDistractors = Array(sameCodeSet.shuffled().prefix(3)).map(\.title)
            if titleDistractors.count == 3 {
                let titleChoices = ([section.title] + titleDistractors).shuffled()
                let titleCorrect = titleChoices.firstIndex(of: section.title) ?? 0
                generated.append(
                    QuizQuestion(
                        id: UUID(),
                        codeSet: section.codeSet,
                        prompt: "What best matches \(section.sectionNumber)?",
                        choices: titleChoices,
                        correctIndex: titleCorrect,
                        explanation: shortExplanation(for: section),
                        linkedSectionNumber: section.sectionNumber,
                        difficulty: section.frequentlyTested ? .intermediate : .advanced
                    )
                )
            }
        }

        if generated.isEmpty {
            return [
                QuizQuestion(
                    id: UUID(),
                    codeSet: .penal,
                    prompt: "Which code section commonly applies to resisting or delaying an officer?",
                    choices: ["PC 148(a)(1)", "PC 245(a)(1)", "VC 12500(a)", "PC 594"],
                    correctIndex: 0,
                    explanation: "PC 148(a)(1) addresses willful resisting, delaying, or obstructing an officer.",
                    linkedSectionNumber: "PC 148(a)(1)",
                    difficulty: .basic
                )
            ]
        }
        return generated.shuffled()
    }

    private static func generateFlashcards(from sections: [CodeSection]) -> [Flashcard] {
        if sections.isEmpty {
            return [
                Flashcard(
                    id: UUID(),
                    front: "PC 148(a)(1)",
                    back: "Willfully resists, delays, or obstructs an officer in duty.",
                    codeSet: .penal
                )
            ]
        }

        return sections.map { section in
            Flashcard(
                id: UUID(),
                front: section.sectionNumber,
                back: "\(section.title)\n\n\(shortSnippet(section.text, limit: 220))",
                codeSet: section.codeSet
            )
        }
    }

    private static func shortExplanation(for section: CodeSection) -> String {
        "\(section.sectionNumber): \(section.title). \(shortSnippet(section.text, limit: 160))"
    }

    private static func shortSnippet(_ text: String, limit: Int) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count > limit else { return trimmed }
        let cutoff = trimmed.index(trimmed.startIndex, offsetBy: limit)
        return "\(trimmed[..<cutoff])..."
    }

    private static let defaultScenarios: [Scenario] = [
        Scenario(
            id: UUID(),
            title: "Late-Night Stop on Elm Street",
            category: .trafficStops,
            summary: "Vehicle weaving over lane markers; driver appears confused after stop.",
            decisions: [
                "Immediately search vehicle without additional basis.",
                "Conduct a structured DUI investigation and document observations.",
                "Issue warning and release without assessment."
            ],
            bestDecisionIndex: 1,
            debrief: "A structured investigation aligns with lawful process and supports defensible enforcement decisions.",
            supporterTierRequired: nil
        ),
        Scenario(
            id: UUID(),
            title: "Escalating Non-Compliance Call",
            category: .useOfForce,
            summary: "Subject refuses commands and advances despite repeated verbal direction.",
            decisions: [
                "Skip verbal commands and escalate immediately.",
                "Use force option proportionate to threat while continuing commands and coordination.",
                "Disengage with no plan or communication."
            ],
            bestDecisionIndex: 1,
            debrief: "Decision-making should remain proportional, documented, and consistent with law and policy.",
            supporterTierRequired: .tier2
        ),
        Scenario(
            id: UUID(),
            title: "Felony Stop Decision Chain",
            category: .trafficStops,
            summary: "Multiple occupants, delayed compliance, conflicting statements.",
            decisions: [
                "Run coordinated commands, cover roles, and staged extraction.",
                "Approach driver's window alone with no cover.",
                "Allow passengers to exit uncoordinated."
            ],
            bestDecisionIndex: 0,
            debrief: "Coordination, communication, and sequencing reduce risk and improve control.",
            supporterTierRequired: .tier5
        ),
        Scenario(
            id: UUID(),
            title: "Critical Incident Review",
            category: .useOfForce,
            summary: "High-stress encounter requiring rapid force justification review.",
            decisions: [
                "Delay documentation and rely on memory later.",
                "Capture decision timeline, threat factors, and legal basis immediately.",
                "Omit conflicting details."
            ],
            bestDecisionIndex: 1,
            debrief: "Timely, complete articulation improves accountability and legal defensibility.",
            supporterTierRequired: .tier10
        )
    ]
}

private struct LocalCaliforniaCodeSeedLoader {
    struct Entry: Decodable {
        let codeSet: String
        let sectionNumber: String
        let title: String
        let text: String
        let tags: [String]?
        let frequentlyTested: Bool?
    }

    func loadFromBundle() -> [CodeSection] {
        let allEntries = loadEntriesFromKnownResources() + loadEntriesFromCustomDocuments()
        guard !allEntries.isEmpty else {
            return []
        }

        let mapped = allEntries.map { entry in
            CodeSection(
                id: UUID(),
                codeSet: mapCodeSet(entry.codeSet, sectionNumber: entry.sectionNumber),
                sectionNumber: entry.sectionNumber,
                title: entry.title,
                text: entry.text,
                tags: entry.tags ?? [],
                frequentlyTested: entry.frequentlyTested ?? false
            )
        }

        var deduped: [String: CodeSection] = [:]
        for section in mapped {
            let key = "\(section.codeSet.rawValue)|\(section.sectionNumber.lowercased())"
            deduped[key] = section
        }
        return Array(deduped.values).sorted { $0.sectionNumber < $1.sectionNumber }
    }

    private func mapCodeSet(_ raw: String, sectionNumber: String) -> CodeSet {
        let normalized = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let sectionPrefix = sectionNumber.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        if sectionPrefix.hasPrefix("hs") || normalized.contains("health") || normalized.contains("safety") || normalized == "hs" {
            return .healthSafety
        }
        if normalized == "vehicle" || normalized == "vc" || normalized.contains("vehicle") {
            return .vehicle
        }
        return .penal
    }

    private func loadEntriesFromKnownResources() -> [Entry] {
        var files: [URL] = []

        if let rootFiles = Bundle.main.urls(forResourcesWithExtension: "json", subdirectory: nil) {
            files.append(contentsOf: rootFiles)
        }
        if let dataFiles = Bundle.main.urls(forResourcesWithExtension: "json", subdirectory: "Data") {
            files.append(contentsOf: dataFiles)
        }

        let codeFiles = files.filter { $0.lastPathComponent.lowercased().contains("code") }
        let unique = Dictionary(grouping: codeFiles, by: \.lastPathComponent).compactMap { $0.value.first }
        return unique.flatMap(loadEntries(from:))
    }

    private func loadEntriesFromCustomDocuments() -> [Entry] {
        let fm = FileManager.default
        guard let documents = fm.urls(for: .documentDirectory, in: .userDomainMask).first else {
            return []
        }
        let customFiles = [
            documents.appendingPathComponent("custom_codes.json"),
            documents.appendingPathComponent("custom_penal_codes.json"),
            documents.appendingPathComponent("custom_vehicle_codes.json")
        ]
        let existing = customFiles.filter { fm.fileExists(atPath: $0.path) }
        return existing.flatMap(loadEntries(from:))
    }

    private func loadEntries(from url: URL) -> [Entry] {
        guard let data = try? Data(contentsOf: url) else {
            return []
        }
        return (try? JSONDecoder().decode([Entry].self, from: data)) ?? []
    }
}
