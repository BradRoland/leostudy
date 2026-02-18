import SwiftUI

struct TierCardView: View {
    let title: String
    let perks: String
    let isActive: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(.white)
                Spacer()
                Text(isActive ? "Active" : "Locked")
                    .font(.caption.bold())
                    .foregroundStyle(isActive ? .green : .white.opacity(0.7))
            }
            Text(perks)
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.8))
        }
        .padding(.vertical, 4)
    }
}
