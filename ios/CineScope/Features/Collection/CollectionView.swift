import SwiftUI

private enum CollectionRoute: Hashable {
    case status(DoubanStatus)
}

struct CollectionView: View {
    let store: CatalogStore
    @Binding var path: NavigationPath

    @Environment(\.openURL) private var openURL
    @State private var showsAbout = false

    var body: some View {
        let buckets = store.collectionBuckets()

        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    header
                    if store.collectionLoading && buckets.values.allSatisfy({ $0.isEmpty }) {
                        loading
                    } else if buckets.values.allSatisfy({ $0.isEmpty }) {
                        emptyCollections
                    } else {
                        wishlistCard(buckets[.wishlist] ?? [])
                        statsRow(buckets)
                        yearSection(buckets[.watched] ?? [])
                        genreSection(buckets[.watched] ?? [])
                    }
                    aboutSection
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 26)
            }
            .scrollIndicators(.hidden)
            .refreshable { await store.refresh() }
            .safeAreaPadding(.top)
            .background(PaperBackground())
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: CollectionRoute.self) { route in
                switch route {
                case .status(let status):
                    CollectionListView(
                        status: status,
                        entries: store.collectionBuckets()[status] ?? [],
                        store: store
                    )
                }
            }
            .navigationDestination(for: CatalogItem.self) { item in
                DetailView(item: item, store: store)
            }
        }
        .task { await store.loadEverythingForCollections() }
        .sheet(isPresented: $showsAbout) {
            AboutSheet()
        }
    }

    // MARK: - 题头

    private var header: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 5) {
                Text("我的片单")
                    .font(CineTheme.heading(28, weight: .heavy))
                    .tracking(-1)
                    .foregroundStyle(CineTheme.ink)
                    .accessibilityAddTraits(.isHeader)
                Text(store.statusesLoaded
                     ? "豆瓣同步 · \(DateText.timestamp(store.statusesUpdatedAt))"
                     : "正在读取豆瓣收藏状态…")
                    .font(CineTheme.body(11))
                    .foregroundStyle(CineTheme.inkMuted)
            }
            Spacer(minLength: 0)
            Image(systemName: "ticket")
                .font(.system(size: 24, weight: .light))
                .rotationEffect(.degrees(-15))
                .foregroundStyle(CineTheme.ink)
                .frame(width: 48, height: 48)
                .background(CineTheme.accentSoft, in: Circle())
                .accessibilityHidden(true)
        }
        .padding(.top, 6)
    }

    private var loading: some View {
        HStack(spacing: 8) {
            ProgressView().controlSize(.small).tint(CineTheme.inkMuted)
            Text("正在汇总各分类片单…")
                .font(CineTheme.body(12))
                .foregroundStyle(CineTheme.inkMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 30)
    }

    private var emptyCollections: some View {
        EmptyStateView(
            icon: "bookmark",
            title: "还没有豆瓣收藏记录",
            message: "在豆瓣标记「想看 / 在看 / 看过」后，下一次数据同步会出现在这里。"
        )
    }

    // MARK: - 想看

    private func wishlistCard(_ entries: [DoubanCollectionEntry]) -> some View {
        Button {
            Haptics.tap()
            path.append(CollectionRoute.status(.wishlist))
        } label: {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 8) {
                    Text("想看清单")
                        .font(CineTheme.heading(17, weight: .heavy))
                    Text("\(entries.count)")
                        .font(CineTheme.mono(12, weight: .bold))
                        .padding(.horizontal, 7)
                        .padding(.vertical, 4)
                        .background(CineTheme.paper, in: Capsule())
                    Spacer(minLength: 0)
                    Image(systemName: "arrow.up.right")
                        .font(.system(size: 14, weight: .semibold))
                }
                if let first = entries.first {
                    HStack(alignment: .top, spacing: 16) {
                        PosterArt(path: first.item.posterPath, cornerRadius: 8)
                            .frame(width: 76, height: 114)
                            .rotationEffect(.degrees(-3))
                            .shadow(color: CineTheme.ink.opacity(0.12), radius: 5, x: 0, y: 3)
                        VStack(alignment: .leading, spacing: 7) {
                            Text(first.item.title)
                                .font(CineTheme.heading(18, weight: .bold))
                                .fixedSize(horizontal: false, vertical: true)
                            Text(([first.item.dateText] + first.item.genres.prefix(2).map(Genres.display))
                                .joined(separator: " · "))
                                .font(CineTheme.body(11))
                                .foregroundStyle(CineTheme.inkMuted)
                            Text(first.item.verifiedRating.map { "豆瓣 ★ \(String(format: "%.1f", $0))" } ?? "豆瓣暂无评分")
                                .font(CineTheme.mono(12, weight: .semibold))
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                } else {
                    Text("还没有标记「想看」的作品")
                        .font(CineTheme.body(13))
                        .foregroundStyle(CineTheme.inkMuted)
                }
                TicketPerforation()
                    .stroke(CineTheme.inkMuted, style: StrokeStyle(lineWidth: 0.75, dash: [3, 4]))
                    .frame(height: 1)
                HStack {
                    Text("豆瓣收藏").font(CineTheme.mono(10))
                    Spacer()
                    Text("查看全部").font(CineTheme.body(12, weight: .semibold))
                    Image(systemName: "arrow.right").font(.system(size: 11, weight: .bold))
                }
            }
            .multilineTextAlignment(.leading)
            .foregroundStyle(CineTheme.ink)
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(CineTheme.ticket, in: TicketShape())
            .contentShape(Rectangle())
        }
        .buttonStyle(PressableStyle(scale: 0.985))
        .accessibilityLabel("想看 \(entries.count) 部，查看全部想看作品")
    }

    // MARK: - 统计

    private func statsRow(_ buckets: [DoubanStatus: [DoubanCollectionEntry]]) -> some View {
        HStack(spacing: 10) {
            statCard(.watching, entries: buckets[.watching] ?? [])
            statCard(.watched, entries: buckets[.watched] ?? [])
        }
    }

    private func statCard(_ status: DoubanStatus, entries: [DoubanCollectionEntry]) -> some View {
        Button {
            Haptics.tap()
            path.append(CollectionRoute.status(status))
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                Text("\(entries.count)")
                    .font(CineTheme.mono(32, weight: .bold))
                    .foregroundStyle(CineTheme.ink)
                HStack(spacing: 4) {
                    Text(status.label)
                        .font(CineTheme.fixed(11.5, weight: .semibold))
                    Image(systemName: "arrow.right")
                        .font(.system(size: 9, weight: .bold))
                }
                .foregroundStyle(CineTheme.inkMuted)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(status == .watching ? CineTheme.accentSoft : CineTheme.paper,
                        in: RoundedRectangle(cornerRadius: CineTheme.controlRadius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: CineTheme.controlRadius, style: .continuous)
                    .strokeBorder(CineTheme.line, lineWidth: 1)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(PressableStyle(scale: 0.98))
        .accessibilityLabel("\(status.label) \(entries.count) 部")
    }

    // MARK: - 年份

    private struct YearBucket: Identifiable {
        let year: String
        let count: Int
        var id: String { year }
    }

    private func yearBuckets(_ entries: [DoubanCollectionEntry]) -> [YearBucket] {
        var counts: [String: Int] = [:]
        for entry in entries {
            let marked = String(entry.markedAt.prefix(4))
            let year = Int(marked) != nil ? marked : entry.item.year
            guard year.count == 4, Int(year) != nil else { continue }
            counts[year, default: 0] += 1
        }
        return counts
            .filter { $0.value >= 2 }
            .map { YearBucket(year: $0.key, count: $0.value) }
            .sorted { $0.year > $1.year }
    }

    @ViewBuilder
    private func yearSection(_ entries: [DoubanCollectionEntry]) -> some View {
        let buckets = yearBuckets(entries)
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("看过的年份")
                    .font(CineTheme.heading(17, weight: .bold))
                Spacer()
                Text("\(entries.count) 部")
                    .font(CineTheme.mono(9.5))
                    .foregroundStyle(CineTheme.inkMuted)
            }

            if buckets.isEmpty {
                Text("暂无时间数据")
                    .font(CineTheme.body(12))
                    .foregroundStyle(CineTheme.inkMuted)
            } else if buckets.count <= 6 {
                // 年份不多时铺满一行，避免左侧堆叠、右侧大片留白。
                HStack(alignment: .bottom, spacing: 10) {
                    yearColumns(buckets, expand: true)
                }
                .padding(.vertical, 2)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .bottom, spacing: 10) {
                        yearColumns(buckets, expand: false)
                    }
                    .padding(.vertical, 2)
                }
            }
        }
        .padding(.top, 2)
    }

    private func yearColumns(_ buckets: [YearBucket], expand: Bool) -> some View {
        ForEach(buckets) { bucket in
            VStack(spacing: 4) {
                Text("\(bucket.count)")
                    .font(CineTheme.mono(9, weight: .bold))
                    .foregroundStyle(CineTheme.inkMuted)
                RoundedRectangle(cornerRadius: 3)
                    .fill(CineTheme.accent)
                    .frame(width: expand ? 34 : 18,
                           height: max(6, CGFloat(bucket.count) / CGFloat(maxCount(buckets)) * 62))
                Text(bucket.year)
                    .font(CineTheme.mono(9))
                    .foregroundStyle(CineTheme.inkMuted)
            }
            .frame(maxWidth: expand ? .infinity : nil)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(bucket.year) 年 \(bucket.count) 部")
        }
    }

    private func maxCount(_ buckets: [YearBucket]) -> Int {
        max(1, buckets.map(\.count).max() ?? 1)
    }

    // MARK: - 类型分布

    private struct GenreBucket: Identifiable {
        let name: String
        let count: Int
        var id: String { name }
    }

    private static let ramp: [Color] = [
        Color(hex: 0xFFE28A), Color(hex: 0xF0C868), Color(hex: 0xD9A441),
        Color(hex: 0xA9761B), Color(hex: 0x6B4A0E)
    ]

    private func genreBuckets(_ entries: [DoubanCollectionEntry]) -> [GenreBucket] {
        var counts: [String: Int] = [:]
        for entry in entries {
            let primary = entry.item.genres.first.map(Genres.display) ?? "未分类"
            counts[primary, default: 0] += 1
        }
        return counts
            .map { GenreBucket(name: $0.key, count: $0.value) }
            .sorted { $0.count > $1.count }
    }

    @ViewBuilder
    private func genreSection(_ entries: [DoubanCollectionEntry]) -> some View {
        let buckets = genreBuckets(entries)
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("看过类型")
                    .font(CineTheme.heading(17, weight: .bold))
                Spacer()
                Text("\(entries.count) 部")
                    .font(CineTheme.mono(9.5))
                    .foregroundStyle(CineTheme.inkMuted)
            }

            if buckets.isEmpty {
                Text("暂无类型数据")
                    .font(CineTheme.body(12))
                    .foregroundStyle(CineTheme.inkMuted)
            } else {
                let total = max(1, entries.count)
                let top = Array(buckets.prefix(5))
                let topCount = max(1, top.first?.count ?? 1)

                GeometryReader { geo in
                    HStack(spacing: 0) {
                        ForEach(Array(top.enumerated()), id: \.element.id) { index, bucket in
                            Rectangle()
                                .fill(Self.ramp[min(index, Self.ramp.count - 1)])
                                .frame(width: geo.size.width * CGFloat(bucket.count) / CGFloat(total))
                        }
                    }
                }
                .frame(height: 10)
                .clipShape(Capsule())
                .accessibilityLabel("看过作品类型占比")

                VStack(spacing: 7) {
                    ForEach(Array(buckets.prefix(8).enumerated()), id: \.element.id) { index, bucket in
                        HStack(spacing: 8) {
                            Circle()
                                .fill(index < Self.ramp.count ? Self.ramp[index] : CineTheme.ink)
                                .frame(width: 7, height: 7)
                            Text(bucket.name)
                                .font(CineTheme.body(11.5))
                                .foregroundStyle(CineTheme.ink)
                                .frame(width: 66, alignment: .leading)
                                .lineLimit(1)
                            GeometryReader { geo in
                                ZStack(alignment: .leading) {
                                    Capsule().fill(CineTheme.ink.opacity(0.06))
                                    Capsule()
                                        .fill(index < Self.ramp.count ? Self.ramp[index] : CineTheme.ink)
                                        .frame(width: max(4, geo.size.width * CGFloat(bucket.count) / CGFloat(topCount)))
                                }
                            }
                            .frame(height: 5)
                            Text("\(Int((Double(bucket.count) / Double(total) * 100).rounded()))%")
                                .font(CineTheme.mono(9.5))
                                .foregroundStyle(CineTheme.inkMuted)
                                .frame(width: 32, alignment: .trailing)
                        }
                    }
                }
            }
        }
    }

    // MARK: - 关于

    private var aboutSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("关于")
                .font(CineTheme.heading(17, weight: .bold))
                .accessibilityAddTraits(.isHeader)

            VStack(spacing: 0) {
                Button {
                    openURL(RemoteConfig.siteURL)
                } label: {
                    aboutRow("在线浏览网页版", icon: "safari")
                }
                Divider().overlay(CineTheme.line)
                Button {
                    showsAbout = true
                } label: {
                    aboutRow("数据来源与许可", icon: "info.circle")
                }
            }
            .background(CineTheme.paper, in: RoundedRectangle(cornerRadius: CineTheme.controlRadius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: CineTheme.controlRadius, style: .continuous)
                    .strokeBorder(CineTheme.line, lineWidth: 1)
            }
        }
    }

    private func aboutRow(_ title: String, icon: String) -> some View {
        HStack(spacing: 9) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(CineTheme.inkMuted)
                .frame(width: 20)
            Text(title)
                .font(CineTheme.body(13))
                .foregroundStyle(CineTheme.ink)
            Spacer(minLength: 4)
            Image(systemName: "chevron.right")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(CineTheme.inkMuted.opacity(0.7))
        }
        .padding(.horizontal, 13)
        .frame(minHeight: 48)
        .contentShape(Rectangle())
    }
}

// MARK: - 收藏列表

struct CollectionListView: View {
    let status: DoubanStatus
    let entries: [DoubanCollectionEntry]
    let store: CatalogStore

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 10) {
                if entries.isEmpty {
                    EmptyStateView(
                        icon: "bookmark",
                        title: "还没有标记「\(status.label)」的作品"
                    )
                } else {
                    ForEach(entries) { entry in
                        NavigationLink(value: entry.item) {
                            row(entry)
                        }
                        .buttonStyle(CardPressStyle())
                    }
                }
            }
            .padding(16)
        }
        .scrollIndicators(.hidden)
        .background(PaperBackground())
        .navigationTitle(status.label)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .toolbarBackground(CineTheme.paper, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
    }

    private func row(_ entry: DoubanCollectionEntry) -> some View {
        HStack(alignment: .top, spacing: 11) {
            PosterArt(path: entry.item.posterPath, cornerRadius: 8)
                .frame(width: 46, height: 69)

            VStack(alignment: .leading, spacing: 4) {
                Text(entry.item.title)
                    .font(CineTheme.body(15, weight: .semibold))
                    .foregroundStyle(CineTheme.ink)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)

                Text(([entry.item.dateText] + entry.item.genres.prefix(2).map(Genres.display))
                    .joined(separator: " · "))
                    .font(CineTheme.mono(9))
                    .foregroundStyle(CineTheme.inkMuted)
                    .lineLimit(1)

                HStack(spacing: 4) {
                    Text("★")
                        .font(.system(size: 9, weight: .semibold))
                    Text(entry.item.verifiedRating.map { String(format: "%.1f", $0) } ?? "暂无评分")
                        .font(CineTheme.mono(9.5, weight: .bold))
                    if !entry.markedAt.isEmpty {
                        Text("· 标记于 \(entry.markedAt)")
                            .font(CineTheme.mono(9))
                            .foregroundStyle(CineTheme.inkMuted)
                    }
                }
                .foregroundStyle(CineTheme.ink)
            }
            Spacer(minLength: 0)
        }
        .padding(9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(CineTheme.paper, in: RoundedRectangle(cornerRadius: CineTheme.controlRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: CineTheme.controlRadius, style: .continuous)
                .strokeBorder(CineTheme.line, lineWidth: 1)
        }
    }
}

// MARK: - 关于

struct AboutSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    private var version: String {
        let short = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"
        return "\(short) (\(build))"
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    HStack(spacing: 12) {
                        CineMark(size: 46)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("鲤鱼·环球片单")
                                .font(CineTheme.heading(18, weight: .heavy))
                            Text("CineScope · \(version)")
                                .font(CineTheme.mono(9.5))
                                .foregroundStyle(CineTheme.inkMuted)
                        }
                    }

                    Text("从近期新作到豆瓣 Top250，在一张片单里找下一部想看的影视。应用读取与网页版相同的 JSON 数据，界面与筛选逻辑由原生实现。")
                        .font(CineTheme.body(13))
                        .foregroundStyle(CineTheme.ink.opacity(0.85))
                        .lineSpacing(3)

                    VStack(alignment: .leading, spacing: 9) {
                        Text("数据来源")
                            .font(CineTheme.heading(13, weight: .heavy))
                        InfoRow(label: "片单", value: "豆瓣、TMDB、Bilibili")
                        InfoRow(label: "实时", value: "猫眼票房与网播热度（上游快照，可能延迟）")
                        InfoRow(label: "缓存", value: "断网时回退到最近一次成功读取的本地副本")
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text("许可")
                            .font(CineTheme.heading(13, weight: .heavy))
                        Text("应用代码遵循 MIT 许可；片单数据与海报版权归原权利人，不适用 MIT。")
                            .font(CineTheme.body(12))
                            .foregroundStyle(CineTheme.inkMuted)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    Button {
                        openURL(RemoteConfig.siteURL)
                    } label: {
                        HStack(spacing: 6) {
                            Text("打开网页版")
                                .font(CineTheme.fixed(13, weight: .semibold))
                            Image(systemName: "arrow.up.right")
                                .font(.system(size: 10, weight: .bold))
                        }
                        .foregroundStyle(CineTheme.ink)
                        .padding(.horizontal, 14)
                        .frame(minHeight: 44)
                        .background(CineTheme.accent, in: Capsule())
                    }
                    .buttonStyle(PressableStyle())
                }
                .padding(18)
            }
            .background(PaperBackground())
            .navigationTitle("关于")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("完成") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}

private struct TicketPerforation: Shape {
    func path(in rect: CGRect) -> Path {
        Path { path in
            path.move(to: CGPoint(x: 0, y: rect.midY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        }
    }
}

/// 票根侧边缺口用路径实现，随内容高度伸展，不覆盖正文。
private struct TicketShape: Shape {
    func path(in rect: CGRect) -> Path {
        let w = rect.width
        let h = rect.height
        let y = h - 54
        return Path { p in
            p.move(to: CGPoint(x: 18, y: 0))
            p.addLine(to: CGPoint(x: w - 18, y: 0))
            p.addQuadCurve(to: CGPoint(x: w, y: 18), control: CGPoint(x: w, y: 0))
            p.addLine(to: CGPoint(x: w, y: y - 8))
            p.addCurve(to: CGPoint(x: w, y: y + 8),
                       control1: CGPoint(x: w - 12, y: y - 8), control2: CGPoint(x: w - 12, y: y + 8))
            p.addLine(to: CGPoint(x: w, y: h - 18))
            p.addQuadCurve(to: CGPoint(x: w - 18, y: h), control: CGPoint(x: w, y: h))
            p.addLine(to: CGPoint(x: 18, y: h))
            p.addQuadCurve(to: CGPoint(x: 0, y: h - 18), control: CGPoint(x: 0, y: h))
            p.addLine(to: CGPoint(x: 0, y: y + 8))
            p.addCurve(to: CGPoint(x: 0, y: y - 8),
                       control1: CGPoint(x: 12, y: y + 8), control2: CGPoint(x: 12, y: y - 8))
            p.addLine(to: CGPoint(x: 0, y: 18))
            p.addQuadCurve(to: CGPoint(x: 18, y: 0), control: .zero)
            p.closeSubpath()
        }
    }
}
