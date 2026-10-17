import SwiftUI

struct SearchView: View {
    let store: CatalogStore
    @Binding var path: NavigationPath

    @State private var query = ""
    @State private var genre: String?
    @State private var rating: RatingSelection = .all
    @State private var year: String?
    @State private var kind: MediaKind?
    @FocusState private var searchFocused: Bool

    private var filterState: CatalogFilterState {
        CatalogFilterState(
            rating: rating,
            genres: genre.map { Set([$0]) } ?? [],
            query: query,
            year: year,
            kind: kind
        )
    }

    private var results: [CatalogItem] {
        CatalogFilter.apply(store.currentItems, category: store.currentCategory, state: filterState)
    }

    private var hasFilters: Bool {
        rating != .all || genre != nil || year != nil || kind != nil
    }

    private var availableKinds: [MediaKind] {
        let kinds = Set(store.currentItems.map(\.kind))
        return [.tv, .movie].filter { kinds.contains($0) }
    }

    var body: some View {
        NavigationStack(path: $path) {
            VStack(spacing: 0) {
                header
                    .padding(.horizontal, 16)
                searchField
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                filterRow
                    .padding(.top, 10)
                Rectangle()
                    .fill(CineTheme.line)
                    .frame(height: 1)
                    .padding(.top, 10)

                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 0) {
                            Color.clear.frame(height: 0).id("search-top")
                            resultList
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 26)
                    }
                    .onChange(of: filterState) { _, _ in proxy.scrollTo("search-top", anchor: .top) }
                }
                .scrollIndicators(.hidden)
                .scrollDismissesKeyboard(.interactively)
            }
            .safeAreaPadding(.top)
            .background(PaperBackground())
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: CatalogItem.self) { item in
                DetailView(item: item, store: store)
            }
        }
        .task { await store.load(category: store.selectedCategory) }
        .onAppear {
            // 深链先切标签页再带搜索词，首次出现时补一次消费。
            if let keyword = store.pendingQuery {
                query = keyword
                store.pendingQuery = nil
            }
        }
        .onChange(of: store.pendingQuery) { _, keyword in
            guard let keyword else { return }
            query = keyword
            store.pendingQuery = nil
        }
        .onChange(of: store.selectedCategory) { _, _ in
            // 与网页端一致：切换分类后清空搜索与筛选。
            query = ""
            genre = nil
            rating = .all
            year = nil
            kind = nil
        }
    }

    // MARK: - 头部

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("搜索")
                .font(CineTheme.heading(28, weight: .heavy))
                .tracking(-1)
                .foregroundStyle(CineTheme.ink)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 6)
            Text("\(store.currentCategory.label) · \(store.currentItems.count) 部")
                .font(CineTheme.mono(9.5))
                .foregroundStyle(CineTheme.inkMuted)
        }
        .padding(.top, 6)
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(CineTheme.inkMuted)

            TextField("搜索片名、别名或关键词", text: $query)
                .font(CineTheme.body(14))
                .foregroundStyle(CineTheme.ink)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .focused($searchFocused)
                .onSubmit { searchFocused = false }
                .accessibilityLabel("搜索片名、别名或关键词")

            if !query.isEmpty {
                Button {
                    query = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(CineTheme.inkMuted)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("清空搜索")
            }
        }
        .padding(.horizontal, 12)
        .frame(minHeight: 52)
        .background(CineTheme.paper, in: RoundedRectangle(cornerRadius: CineTheme.controlRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: CineTheme.controlRadius, style: .continuous)
                .strokeBorder(searchFocused ? CineTheme.ink : CineTheme.controlLine, lineWidth: searchFocused ? 1.5 : 0.75)
        }
        .animation(CineMotion.smooth, value: searchFocused)
    }

    private var filterRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 7) {
                Menu {
                    Button("不限") { genre = nil }
                    ForEach(store.availableGenres, id: \.self) { value in
                        Button(Genres.display(value)) { genre = value }
                    }
                } label: {
                    filterChip("类型", genre.map(Genres.display) ?? "不限", active: genre != nil)
                }

                Menu {
                    ForEach(store.ratingChoices) { choice in
                        Button(choice.label) { rating = choice.selection }
                    }
                } label: {
                    filterChip("评分", rating == .all ? "不限" : (store.ratingChoices.first { $0.selection == rating }?.label ?? "不限"), active: rating != .all)
                }

                Menu {
                    Button("不限") { year = nil }
                    ForEach(CatalogFilter.availableYears(in: store.currentItems), id: \.self) { value in
                        Button(value) { year = value }
                    }
                } label: {
                    filterChip("年份", year ?? "不限", active: year != nil)
                }

                if availableKinds.count > 1 {
                    Menu {
                        Button("不限") { kind = nil }
                        ForEach(availableKinds, id: \.self) { value in
                            Button(value == .tv ? "剧集" : "电影") { kind = value }
                        }
                    } label: {
                        filterChip("形式", kind.map { $0 == .tv ? "剧集" : "电影" } ?? "不限", active: kind != nil)
                    }
                }

                if hasFilters {
                    Button {
                        genre = nil
                        rating = .all
                        year = nil
                        kind = nil
                    } label: {
                        Text("重置")
                            .font(CineTheme.fixed(11.5, weight: .semibold))
                            .foregroundStyle(CineTheme.ink)
                            .padding(.horizontal, 10)
                            .frame(minHeight: 44)
                            .background(CineTheme.accentSoft, in: Capsule())
                    }
                    .buttonStyle(PressableStyle(scale: 0.97))
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 1)
        }
    }

    private func filterChip(_ title: String, _ value: String, active: Bool) -> some View {
        HStack(spacing: 4) {
            Text("\(title):")
                .font(CineTheme.fixed(10.5))
                .foregroundStyle(CineTheme.inkMuted)
            Text(value)
                .font(CineTheme.fixed(11.5, weight: .semibold))
                .foregroundStyle(CineTheme.ink)
            Image(systemName: "chevron.down")
                .font(.system(size: 8, weight: .bold))
                .foregroundStyle(CineTheme.inkMuted)
        }
        .padding(.horizontal, 11)
        .frame(minHeight: 44)
        .background(active ? CineTheme.accentSoft : CineTheme.paper, in: Capsule())
        .overlay {
            Capsule().strokeBorder(active ? CineTheme.ink : CineTheme.controlLine, lineWidth: 1)
        }
    }

    // MARK: - 结果

    @ViewBuilder
    private var resultList: some View {
        let items = results

        HStack {
            Text(store.isCurrentStale ? "离线数据 · \(items.count) 条结果" : "\(items.count) 条结果")
                .font(CineTheme.mono(9.5))
                .foregroundStyle(CineTheme.inkMuted)
            Spacer()
            if store.isCurrentLoading {
                ProgressView().controlSize(.mini).tint(CineTheme.inkMuted)
            }
        }
        .padding(.top, 12)
        .padding(.bottom, 8)

        if store.isCurrentLoading && store.currentItems.isEmpty {
            ProgressView("正在读取片单…")
                .font(CineTheme.body(13))
                .frame(maxWidth: .infinity, minHeight: 160)
        } else if let error = store.currentError, store.currentItems.isEmpty {
            EmptyStateView(icon: "wifi.exclamationmark", title: "搜索片单加载失败", message: error, actionTitle: "重新加载") {
                Task { await store.load(category: store.selectedCategory, force: true) }
            }
        } else if items.isEmpty {
            if query.trimmed.isEmpty && !hasFilters {
                EmptyStateView(
                    icon: "text.magnifyingglass",
                    title: "输入片名、别名或关键词",
                    message: "搜索范围是当前分类：\(store.currentCategory.label)。"
                )
            } else {
                EmptyStateView(
                    icon: "magnifyingglass",
                    title: "没有符合条件的内容",
                    actionTitle: "清空搜索与筛选"
                ) {
                    query = ""
                    genre = nil
                    rating = .all
                    year = nil
                    kind = nil
                }
            }
        } else {
            LazyVStack(spacing: 9) {
                ForEach(items) { item in
                    NavigationLink(value: item) {
                        SearchResultRow(item: item, status: store.status(for: item))
                    }
                    .buttonStyle(CardPressStyle())
                }
            }
        }
    }
}

struct SearchResultRow: View {
    let item: CatalogItem
    let status: DoubanStatus?

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            PosterArt(path: item.posterPath, cornerRadius: 8)
                .frame(width: 60, height: 90)

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 5) {
                    Text(item.title)
                        .font(CineTheme.body(15, weight: .semibold))
                        .foregroundStyle(CineTheme.ink)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    if let status {
                        DoubanStatusBadge(status: status)
                    }
                }

                Text(([item.kindLabel, item.dateText] + item.genres.prefix(2).map(Genres.display))
                    .joined(separator: " · "))
                    .font(CineTheme.body(11))
                    .foregroundStyle(CineTheme.inkMuted)
                    .lineLimit(1)

                Text(item.verifiedRating.map { "豆瓣 ★ \(String(format: "%.1f", $0))" } ?? "暂无评分")
                    .font(CineTheme.mono(9.5, weight: .bold))
                    .foregroundStyle(CineTheme.inkMuted)

                if !item.overview.isEmpty {
                    Text(item.overview)
                        .font(CineTheme.body(11))
                        .foregroundStyle(CineTheme.inkMuted.opacity(0.9))
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(CineTheme.paper, in: RoundedRectangle(cornerRadius: CineTheme.controlRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: CineTheme.controlRadius, style: .continuous)
                .strokeBorder(CineTheme.line, lineWidth: 1)
        }
        .accessibilityElement(children: .combine)
    }
}
