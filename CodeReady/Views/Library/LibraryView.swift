import SwiftUI

struct LibraryView: View {
    @EnvironmentObject private var appState: AppState
    @State private var searchText: String = ""
    @State private var showFavoritesOnly = false

    private var filteredSections: [CodeSection] {
        appState.repository.sections
            .filter { $0.codeSet == appState.selectedCodeSet }
            .filter { section in
                if !showFavoritesOnly { return true }
                return appState.favorites.contains(section.id)
            }
            .filter { section in
                guard !searchText.isEmpty else { return true }
                let candidate = "\(section.sectionNumber) \(section.title) \(section.text) \(section.tags.joined(separator: " "))"
                return candidate.localizedCaseInsensitiveContains(searchText)
            }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("California Code Library")
                        .font(.title2.bold())
                        .foregroundStyle(.white)
                    Text("Browse sections, save favorites, and search fast.")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.8))
                }
                .cardContainer()

                VStack(spacing: 12) {
                    Picker("Code Set", selection: $appState.selectedCodeSet) {
                        ForEach(CodeSet.allCases) { set in
                            Text(set.rawValue).tag(set)
                        }
                    }
                    .pickerStyle(.segmented)

                    Toggle("Favorites only", isOn: $showFavoritesOnly)
                        .tint(AppTheme.sky)
                        .foregroundStyle(.white)
                }
                .cardContainer()

                VStack(alignment: .leading, spacing: 12) {
                    Text("\(filteredSections.count) sections")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.8))

                    ForEach(filteredSections) { section in
                        NavigationLink {
                            SectionDetailView(section: section)
                        } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                HStack {
                                    Text(section.sectionNumber)
                                        .font(.headline)
                                        .foregroundStyle(.white)
                                    Spacer()
                                    masteryBadge(for: section)
                                    if section.frequentlyTested {
                                        Text("Frequently Tested")
                                            .font(.caption2.bold())
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 4)
                                            .background(AppTheme.mint.opacity(0.28))
                                            .clipShape(Capsule())
                                    }
                                }
                                Text(section.title)
                                    .font(.subheadline)
                                    .foregroundStyle(.white.opacity(0.85))
                                if !section.tags.isEmpty {
                                    Text(section.tags.prefix(3).joined(separator: " • "))
                                        .font(.caption)
                                        .foregroundStyle(.white.opacity(0.65))
                                }
                            }
                            .cardContainer()
                        }
                        .buttonStyle(.plain)
                        .swipeActions(edge: .trailing) {
                            Button {
                                appState.toggleFavorite(section: section)
                            } label: {
                                Label(
                                    appState.favorites.contains(section.id) ? "Unfavorite" : "Favorite",
                                    systemImage: appState.favorites.contains(section.id) ? "star.slash" : "star"
                                )
                            }
                            .tint(.yellow)
                        }
                    }
                }
            }
            .padding()
        }
        .navigationTitle("Library")
        .navigationBarTitleDisplayMode(.large)
        .searchable(text: $searchText, prompt: "Search section, title, or keyword")
        .appScreenBackground()
    }

    @ViewBuilder
    private func masteryBadge(for section: CodeSection) -> some View {
        let level = appState.masteryLevel(for: section)
        switch level {
        case .mastered:
            Text("Mastered")
                .font(.caption2.bold())
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.green.opacity(0.28))
                .clipShape(Capsule())
                .foregroundStyle(.white)
        case .needsWork:
            Text("Needs Work")
                .font(.caption2.bold())
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.orange.opacity(0.28))
                .clipShape(Capsule())
                .foregroundStyle(.white)
        case .unknown:
            EmptyView()
        }
    }
}

struct SectionDetailView: View {
    @EnvironmentObject private var appState: AppState
    let section: CodeSection

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text(section.sectionNumber)
                        .font(.title2.bold())
                        .foregroundStyle(.white)
                    Spacer()
                    Button {
                        appState.toggleFavorite(section: section)
                    } label: {
                        Image(systemName: appState.favorites.contains(section.id) ? "star.fill" : "star")
                            .foregroundStyle(.yellow)
                    }
                }

                Text(section.title)
                    .font(.headline)
                    .foregroundStyle(.white)

                masteryBadge(for: section)

                Text(section.text)
                    .font(.body)
                    .foregroundStyle(.white.opacity(0.9))

                if !section.tags.isEmpty {
                    Text("Tags: \(section.tags.joined(separator: ", "))")
                        .font(.footnote)
                        .foregroundStyle(.white.opacity(0.7))
                }
            }
            .cardContainer()
            .padding()
        }
        .navigationTitle(section.sectionNumber)
        .navigationBarTitleDisplayMode(.inline)
        .appScreenBackground()
    }

    @ViewBuilder
    private func masteryBadge(for section: CodeSection) -> some View {
        let level = appState.masteryLevel(for: section)
        switch level {
        case .mastered:
            Text("Mastered")
                .font(.caption2.bold())
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.green.opacity(0.28))
                .clipShape(Capsule())
                .foregroundStyle(.white)
        case .needsWork:
            Text("Needs Work")
                .font(.caption2.bold())
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.orange.opacity(0.28))
                .clipShape(Capsule())
                .foregroundStyle(.white)
        case .unknown:
            EmptyView()
        }
    }
}
