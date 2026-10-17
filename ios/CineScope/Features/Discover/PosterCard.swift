import SwiftUI

/// 海报是主角：评分落在海报上，正文只保留片名、日期与类型。
struct PosterCard: View {
    let item: CatalogItem
    let status: DoubanStatus?

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            PosterArt(path: item.posterPath)
                .aspectRatio(2.0 / 3.0, contentMode: .fit)
                .overlay(alignment: .top) {
                    HStack(alignment: .top, spacing: 4) {
                        if let label = item.posterStatusLabel {
                            Text(label)
                                .font(CineTheme.fixed(10, weight: .semibold))
                                .foregroundStyle(CineTheme.paper)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 5)
                                .background(CineTheme.ink, in: Capsule())
                        }
                        Spacer(minLength: 0)
                        if let status { DoubanStatusBadge(status: status) }
                    }
                    .padding(8)
                }
                .overlay(alignment: .bottomLeading) {
                    if let rating = item.verifiedRating {
                        HStack(spacing: 4) {
                            Image(systemName: "star.fill").font(.system(size: 10, weight: .bold))
                            Text(String(format: "%.1f", rating))
                                .font(CineTheme.mono(14, weight: .bold))
                        }
                        .foregroundStyle(CineTheme.ink)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(CineTheme.accent, in: RoundedRectangle(cornerRadius: 8))
                        .padding(8)
                    }
                }
                .overlay {
                    RoundedRectangle(cornerRadius: CineTheme.mediaRadius)
                        .strokeBorder(CineTheme.ink.opacity(0.08), lineWidth: 0.5)
                }

            VStack(alignment: .leading, spacing: 4) {
                Text(item.title)
                    .font(CineTheme.heading(15, weight: .bold))
                    .foregroundStyle(CineTheme.ink)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Text(([item.dateText] + item.genres.prefix(1).map(Genres.display)).joined(separator: " · "))
                    .font(CineTheme.body(11))
                    .foregroundStyle(CineTheme.inkMuted)
                    .fixedSize(horizontal: false, vertical: true)
                    .multilineTextAlignment(.leading)
                if item.verifiedRating == nil {
                    Text("豆瓣暂无评分")
                        .font(CineTheme.body(10))
                        .foregroundStyle(CineTheme.inkMuted)
                }
            }
            .padding(.horizontal, 1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityHint("查看作品详情")
    }

    private var accessibilityLabel: String {
        var parts = [item.title]
        parts.append(item.verifiedRating.map { "豆瓣 \(String(format: "%.1f", $0))" } ?? "暂无评分")
        parts.append(item.dateText)
        if let label = item.posterStatusLabel { parts.append(label) }
        if let status { parts.append(status.label) }
        return parts.joined(separator: "，")
    }
}
