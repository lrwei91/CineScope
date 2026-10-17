import SwiftUI

struct DetailView: View {
    let item: CatalogItem
    let store: CatalogStore

    @Environment(\.openURL) private var openURL
    @State private var playingTrailer: Trailer?
    @State private var isSharing = false
    @State private var sharePayload: SharePayload?
    @State private var shareError: String?
    @Environment(\.dynamicTypeSize) private var typeSize

    private var status: DoubanStatus? { store.status(for: item) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                hero
                if let trailer = item.trailers.first { primaryTrailer(trailer) }
                chips
                if !item.overview.isEmpty { overview }
                credits
                if !item.networks.isEmpty { platforms }
                if item.boxOffice != nil || item.tvHeat != nil { realtime }
                if !item.trailers.isEmpty { trailers }
                links
                footnote
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .background(PaperBackground())
        .toolbar(.visible, for: .navigationBar)
        .toolbarBackground(CineTheme.paper, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    Task { await prepareShare() }
                } label: {
                    if isSharing {
                        ProgressView().controlSize(.small)
                    } else {
                        Image(systemName: "square.and.arrow.up")
                    }
                }
                .disabled(isSharing)
                .accessibilityLabel("分享")
            }
        }
        .sheet(item: $playingTrailer) { trailer in
            TrailerView(trailer: trailer)
        }
        .sheet(item: $sharePayload) { payload in
            SharePreviewView(payload: payload)
        }
        .alert("分享图生成失败", isPresented: Binding(
            get: { shareError != nil },
            set: { if !$0 { shareError = nil } }
        )) {
            Button("知道了", role: .cancel) { shareError = nil }
        } message: {
            Text(shareError ?? "请稍后重试。")
        }
        .onAppear {
            // 深链 `cinescope://share?id=` 直达：进入详情后立刻生成分享图。
            guard store.autoShareItemID == item.id else { return }
            store.autoShareItemID = nil
            Task { await prepareShare() }
        }
    }

    // MARK: - 分享

    private func prepareShare() async {
        guard !isSharing else { return }
        isSharing = true
        defer { isSharing = false }

        guard let image = await ShareCardRenderer.render(item: item) else {
            Haptics.warning()
            shareError = "海报或二维码生成失败。"
            return
        }
        guard let fileURL = ShareCardRenderer.writeJPEG(image, item: item) else {
            Haptics.warning()
            shareError = "无法写入分享文件。"
            return
        }

        Haptics.success()
        sharePayload = SharePayload(image: image, fileURL: fileURL, title: item.title)
    }

    // MARK: - 顶部

    private var hero: some View {
        VStack(alignment: .leading, spacing: 20) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: 20) {
                    heroPoster
                    heroTitle.frame(minWidth: 136, maxWidth: .infinity, alignment: .leading)
                }
                VStack(alignment: .leading, spacing: 20) {
                    heroPoster
                    heroTitle
                }
            }
            FlowRow(spacing: 7) {
                TagPill(text: item.dateText)
                if !item.detailRuntime.isEmpty { TagPill(text: item.detailRuntime) }
                if !item.detailStatus.isEmpty { TagPill(text: item.detailStatus, highlighted: true) }
                if let status { DoubanStatusBadge(status: status) }
            }
        }
        .padding(.top, 8)
    }

    private var heroPoster: some View {
        PosterArt(path: item.posterPath, cornerRadius: 12)
            .frame(width: typeSize.isAccessibilitySize ? 100 : 128,
                   height: typeSize.isAccessibilitySize ? 150 : 192)
            .background {
                RoundedRectangle(cornerRadius: 12)
                    .fill(CineTheme.accent)
                    .rotationEffect(.degrees(-4))
                    .offset(x: -3, y: 3)
            }
            .shadow(color: CineTheme.ink.opacity(0.12), radius: 10, x: 0, y: 5)
    }

    private var heroTitle: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text([item.kindLabel, item.year].filter { !$0.isEmpty }.joined(separator: " · "))
                .font(CineTheme.mono(11))
                .foregroundStyle(CineTheme.inkMuted)
            Text(item.title)
                .font(CineTheme.heading(25, weight: .heavy))
                .tracking(-0.8)
                .foregroundStyle(CineTheme.ink)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            if !item.subtitle.isEmpty, item.subtitle != item.title {
                Text(item.subtitle)
                    .font(CineTheme.body(12))
                    .foregroundStyle(CineTheme.inkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            ratingBlock
        }
    }

    private var ratingBlock: some View {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
            if let rating = item.verifiedRating {
                Image(systemName: "star.fill").font(.system(size: 12, weight: .bold))
                Text(String(format: "%.1f", rating))
                    .font(CineTheme.mono(25, weight: .bold))
                Text("豆瓣").font(CineTheme.body(11))
            } else {
                Text("豆瓣暂无评分").font(CineTheme.body(12, weight: .medium))
            }
        }
        .foregroundStyle(CineTheme.ink)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(CineTheme.accentSoft, in: RoundedRectangle(cornerRadius: 10))
        .accessibilityElement(children: .combine)
    }

    private func primaryTrailer(_ trailer: Trailer) -> some View {
        Button {
            Haptics.tap()
            playingTrailer = trailer
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "play.fill").font(.system(size: 12, weight: .bold))
                Text("播放预告片").font(CineTheme.body(14, weight: .semibold))
                Spacer()
                Image(systemName: "arrow.up.right").font(.system(size: 12, weight: .semibold))
            }
            .foregroundStyle(CineTheme.paper)
            .padding(.horizontal, 16)
            .frame(minHeight: 50)
            .background(CineTheme.ink, in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(PressableStyle(scale: 0.985))
    }

    private var chips: some View {
        VStack(alignment: .leading, spacing: 6) {
            if !item.releaseWindows.isEmpty || !item.genres.isEmpty {
                FlowRow(spacing: 6) {
                    ForEach(item.releaseWindows) { window in
                        TagPill(text: window.label, highlighted: true)
                    }
                    ForEach(Genres.sorted(item.genres), id: \.self) { genre in
                        TagPill(text: Genres.display(genre))
                    }
                }
            }
        }
    }

    private var overview: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionTitle("简介")
            Text(item.overview)
                .font(CineTheme.body(16))
                .foregroundStyle(CineTheme.ink)
                .lineSpacing(6)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var credits: some View {
        VStack(alignment: .leading, spacing: 9) {
            sectionTitle("演职人员")
            if !item.directors.isEmpty { InfoRow(label: "导演", value: item.directors.joined(separator: " / ")) }
            if !item.actors.isEmpty { InfoRow(label: "主演", value: item.actors.prefix(5).joined(separator: " / ")) }
            if !item.countries.isEmpty { InfoRow(label: "国家", value: item.countries.joined(separator: " / ")) }
            if !item.languages.isEmpty { InfoRow(label: "语言", value: item.languages.joined(separator: " / ")) }
            if !item.aka.isEmpty { InfoRow(label: "又名", value: item.aka.prefix(4).joined(separator: " / ")) }
            if let count = item.ratingCount {
                InfoRow(label: "评价", value: "\(count) 人评分")
            }
        }
    }

    private var platforms: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionTitle("播出平台")
            FlowRow(spacing: 6) {
                ForEach(item.networks, id: \.self) { network in
                    TagPill(text: network)
                }
            }
        }
    }

    private var realtime: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionTitle(item.kind == .movie ? "实时票房" : "网播热度")

            VStack(alignment: .leading, spacing: 6) {
                if let boxOffice = item.boxOffice {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(boxOffice.rank.map { "#\($0)" } ?? "实时")
                            .font(CineTheme.mono(11, weight: .bold))
                            .foregroundStyle(CineTheme.inkMuted)
                        Text(boxOffice.headline)
                            .font(CineTheme.heading(20, weight: .heavy))
                        Text("今日票房")
                            .font(CineTheme.mono(9.5))
                            .foregroundStyle(CineTheme.inkMuted)
                    }
                    if !boxOffice.cumulativeBoxOffice.isEmpty {
                        InfoRow(label: "累计", value: boxOffice.cumulativeBoxOffice)
                    }
                    if !boxOffice.boxOfficeRate.isEmpty {
                        InfoRow(label: "占比", value: boxOffice.boxOfficeRate)
                    }
                    if !boxOffice.showCountRate.isEmpty {
                        InfoRow(label: "排片", value: boxOffice.showCountRate)
                    }
                }

                if let heat = item.tvHeat {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(heat.rank.map { "#\($0)" } ?? "实时")
                            .font(CineTheme.mono(11, weight: .bold))
                            .foregroundStyle(CineTheme.inkMuted)
                        Text(heat.headline)
                            .font(CineTheme.heading(20, weight: .heavy))
                        Text("实时热度")
                            .font(CineTheme.mono(9.5))
                            .foregroundStyle(CineTheme.inkMuted)
                    }
                }

                Text("猫眼实时数据为上游快照，可能与当前实际值有延迟。")
                    .font(CineTheme.mono(9))
                    .foregroundStyle(CineTheme.inkMuted)
                    .padding(.top, 2)
            }
            .padding(13)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(CineTheme.paper, in: RoundedRectangle(cornerRadius: CineTheme.controlRadius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: CineTheme.controlRadius, style: .continuous)
                    .strokeBorder(CineTheme.line, lineWidth: 1)
            }
        }
    }

    private var trailers: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionTitle("预告片")
            VStack(spacing: 8) {
                ForEach(Array(item.trailers.enumerated()), id: \.element.id) { index, trailer in
                    Button {
                        Haptics.tap()
                        playingTrailer = trailer
                    } label: {
                        HStack(spacing: 9) {
                            Image(systemName: "play.circle.fill")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(CineTheme.ink)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.trailers.count > 1 ? "预告片 \(index + 1)" : "播放预告片")
                                    .font(CineTheme.fixed(13, weight: .semibold))
                                    .foregroundStyle(CineTheme.ink)
                                Text(trailer.title)
                                    .font(CineTheme.body(11))
                                    .foregroundStyle(CineTheme.inkMuted)
                                    .lineLimit(2)
                                    .multilineTextAlignment(.leading)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 13)
                        .padding(.vertical, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(CineTheme.paper, in: RoundedRectangle(cornerRadius: CineTheme.controlRadius, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: CineTheme.controlRadius, style: .continuous)
                                .strokeBorder(CineTheme.line, lineWidth: 1)
                        }
                    }
                    .buttonStyle(PressableStyle(scale: 0.99))
                }
            }
        }
    }

    private var links: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionTitle("外部链接")
            FlowRow(spacing: 8) {
                if item.doubanVerified, let link = item.doubanLink, let url = URL(string: link) {
                    linkButton("豆瓣") {
                        DoubanLink.open(subjectID: item.doubanSubjectID, webFallback: url)
                    }
                }
                if let url = tmdbLink {
                    linkButton(item.tmdbURL == nil ? "搜索 TMDB" : "TMDB") { openURL(url) }
                }
                if let link = item.imdbURL, let url = URL(string: link) {
                    linkButton("IMDb") { openURL(url) }
                }
            }
        }
    }

    private var tmdbLink: URL? {
        if let link = item.tmdbURL, let url = URL(string: link) { return url }
        let query = item.title.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        return URL(string: "https://www.themoviedb.org/search?query=\(query)")
    }

    private func linkButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button {
            action()
        } label: {
            HStack(spacing: 4) {
                Text(title)
                    .font(CineTheme.fixed(12, weight: .semibold))
                Image(systemName: "arrow.up.right")
                    .font(.system(size: 9, weight: .bold))
            }
            .foregroundStyle(CineTheme.ink)
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .background(CineTheme.paper, in: Capsule())
            .overlay { Capsule().strokeBorder(CineTheme.ink.opacity(0.55), lineWidth: 1) }
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel("打开 \(title)")
    }

    private var footnote: some View {
        VStack(alignment: .leading, spacing: 3) {
            Rectangle().fill(CineTheme.line).frame(height: 1).padding(.bottom, 6)
            Text("数据来自豆瓣 / TMDB / 猫眼 / Bilibili，评分与上映信息以上游为准。")
                .font(CineTheme.mono(9))
                .foregroundStyle(CineTheme.inkMuted)
        }
    }

    private func sectionTitle(_ text: String) -> some View {
        HStack(spacing: 8) {
            Rectangle().fill(CineTheme.accent).frame(width: 4, height: 17)
            Text(text).font(CineTheme.heading(17, weight: .bold))
        }
        .foregroundStyle(CineTheme.ink)
        .accessibilityAddTraits(.isHeader)
    }

    private var shareText: String {
        var parts = [item.title]
        if let rating = item.verifiedRating {
            parts.append("豆瓣 \(String(format: "%.1f", rating))")
        }
        parts.append(item.dateText)
        if !item.overview.isEmpty {
            parts.append(String(item.overview.prefix(80)))
        }
        return parts.joined(separator: " · ")
    }
}

/// 简易流式布局：标签数量不多，避免引入额外依赖。
struct FlowRow: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = max(0, proposal.width ?? .infinity)
        var rowWidth: CGFloat = 0
        var rowHeight: CGFloat = 0
        var totalHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(ProposedViewSize(width: maxWidth.isFinite ? maxWidth : nil, height: nil))
            if rowWidth > 0, rowWidth + spacing + size.width > maxWidth {
                totalHeight += rowHeight + spacing
                rowWidth = size.width
                rowHeight = size.height
            } else {
                rowWidth += (rowWidth > 0 ? spacing : 0) + size.width
                rowHeight = max(rowHeight, size.height)
            }
        }
        totalHeight += rowHeight
        return CGSize(width: maxWidth.isFinite ? maxWidth : rowWidth, height: totalHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(ProposedViewSize(width: bounds.width, height: nil))
            if x > bounds.minX, x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
