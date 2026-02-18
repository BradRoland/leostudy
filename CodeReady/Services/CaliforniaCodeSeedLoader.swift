import Foundation

struct CaliforniaCodeSeedLoader {
    struct Entry: Decodable {
        let codeSet: String
        let sectionNumber: String
        let title: String
        let text: String
        let tags: [String]?
        let frequentlyTested: Bool?
    }

    func loadFromBundle() -> [CodeSection] {
        guard let url = Bundle.main.url(forResource: "ca_codes_seed", withExtension: "json") else {
            return []
        }
        guard let data = try? Data(contentsOf: url) else {
            return []
        }
        guard let entries = try? JSONDecoder().decode([Entry].self, from: data) else {
            return []
        }

        return entries.map { entry in
            CodeSection(
                id: UUID(),
                codeSet: mapCodeSet(entry.codeSet),
                sectionNumber: entry.sectionNumber,
                title: entry.title,
                text: entry.text,
                tags: entry.tags ?? [],
                frequentlyTested: entry.frequentlyTested ?? false
            )
        }
    }

    private func mapCodeSet(_ raw: String) -> CodeSet {
        let normalized = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if normalized == "vehicle" || normalized == "vc" || normalized.contains("vehicle") {
            return .vehicle
        }
        return .penal
    }
}
