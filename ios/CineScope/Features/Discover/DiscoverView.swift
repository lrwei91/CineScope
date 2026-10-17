import SwiftUI

struct DiscoverView: View {
    let store: CatalogStore
    @Binding var path: NavigationPath

    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var showsCategories = false
    @State private var showsFilters = false

    private var columns: [GridItem] {
        typeSize.isAccessibilitySize
            ? [GridItem(.flexible(), spacing: 12, alignment: .top)]
            : [GridItem(.adaptive(minimum: 156), spacing: 12, alignment: .top)]
    }

    var body: some View {
        NavigationStack(path: $path) {
            VStack(spacing: 0) {
                header
                    .padding(.horizontal, 16)
                filterBar
                    .padding(.top, 10)
                Rectangle()
                    .fill(CineTheme.line)
                    .frame(height: 1)
                    .padding(.top, 10)

                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(spacing: 0) {
                            Color.clear.frame(height: 0).id("catalog-top")
                            content
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 26)
                    }
                    .onChange(of: store.selectedCategory) { _, _ in proxy.scrollTo("catalog-top", anchor: .top) }
                    .onChange(of: store.rating) { _, _ in proxy.scrollTo("catalog-top", anchor: .top) }
                    .onChange(of: store.selectedGenres) { _, _ in proxy.scrollTo("catalog-top", anchor: .top) }
                }
                .scrollIndicators(.hidden)
                .refreshable { await store.refresh() }
            }
            .safeAreaPadding(.top)
            .background(PaperBackground())
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: CatalogItem.self) { item in
                DetailView(item: item, store: store)
            }
        }
        .sheet(isPresented: $showsCategories) {
            CategorySheet(store: store)
        }
        .sheet(isPresented: $showsFilters) {
            DiscoverFilterSheet(store: store)
        }
        .task {
            await store.load(category: store.selectedCategory)
        }
    }

    // MARK: - 题头

    private var header: some View {
        HStack(alignment: .center, spacing: 12) {
            Button {
                Haptics.tap()
                showsCategories = true
            } label: {
                HStack(spacing: 10) {
                    CineMark(size: 34)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("鲤鱼 · 环球片单")
                            .font(CineTheme.body(11, weight: .medium))
                            .foregroundStyle(CineTheme.inkMuted)
                        HStack(spacing: 7) {
                            Text(store.currentCategory.label)
                                .font(CineTheme.heading(25, weight: .heavy))
                                .tracking(-0.8)
                            Image(systemName: "chevron.down")
                                .font(.system(size: 11, weight: .bold))
                        }
                        .foregroundStyle(CineTheme.ink)
                    }
                }
                .frame(minHeight: 56, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(PressableStyle(scale: 0.99))
            .accessibilityLabel("当前分类 \(store.currentCategory.label)，点按切换分类")
            Spacer(minLength: 0)
            Button {
                Haptics.tap()
                showsFilters = true
            } label: {
                Image(systemName: "slider.horizontal.3")
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(CineTheme.ink)
                    .frame(width: 48, height: 48)
                    .background(store.selectedGenres.isEmpty ? CineTheme.paper : CineTheme.accent,
                                in: RoundedRectangle(cornerRadius: 16))
                    .overlay {
                        RoundedRectangle(cornerRadius: 16)
                            .strokeBorder(CineTheme.controlLine, lineWidth: 0.75)
                    }
                    .overlay(alignment: .topTrailing) {
                        if !store.selectedGenres.isEmpty {
                            Text("\(store.selectedGenres.count)")
                                .font(CineTheme.fixed(10, weight: .bold))
                                .foregroundStyle(CineTheme.paper)
                                .frame(minWidth: 18, minHeight: 18)
                                .background(CineTheme.ink, in: Circle())
                                .offset(x: 4, y: -4)
                        }
                    }
            }
            .buttonStyle(PressableStyle())
            .accessibilityLabel("筛选，已选 \(store.selectedGenres.count) 个类型")
        }
        .padding(.top, 4)
    }

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 7) {
                ForEach(store.ratingChoices) { choice in
                    FilterChip(title: choice.label, isActive: store.rating == choice.selection) {
                        Haptics.tap()
                        store.setRating(choice.selection)
                    }
                }
                if !store.selectedGenres.isEmpty {
                    FilterChip(title: "类型 · \(store.selectedGenres.count)", isActive: true) {
                        showsFilters = true
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 1)
        }
        .accessibilityLabel("评分筛选")
    }

    // MARK: - 片单

    @ViewBuilder
    private var content: some View {
        if store.isCurrentLoading && store.currentItems.isEmpty {
            SkeletonGrid(columns: columns)
                .padding(.top, 14)
        } else if let error = store.currentError, store.currentItems.isEmpty {
            EmptyStateView(
                icon: "wifi.exclamationmark",
                title: "片单加载失败",
                message: error,
                actionTitle: "重新加载"
            ) {
                Task { await store.load(category: store.selectedCategory, force: true) }
            }
        } else if store.filteredItems.isEmpty {
            let emptyCategory = store.currentItems.isEmpty
            EmptyStateView(
                icon: "magnifyingglass",
                title: emptyCategory ? "当前分类暂无内容" : "没有找到符合条件的内容",
                message: emptyCategory ? "稍后下拉刷新试试。" : "可以放宽评分或类型条件。",
                actionTitle: emptyCategory ? nil : "清空筛选"
            ) {
                store.rating = .all
                store.selectedGenres = []
            }
        } else {
            VStack(spacing: 0) {
                ForEach(store.sections) { section in
                    if let title = section.title {
                        MonthHeader(title: title)
                    }
                    LazyVGrid(columns: columns, alignment: .leading, spacing: 14) {
                        ForEach(section.items) { item in
                            NavigationLink(value: item) {
                                PosterCard(item: item, status: store.status(for: item))
                            }
                            .buttonStyle(CardPressStyle())
                        }
                    }
                    .padding(.top, 12)
                }
            }
            .padding(.top, 2)
            footer
        }
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 5) {
            Rectangle()
                .fill(CineTheme.line)
                .frame(height: 1)
                .padding(.top, 22)
            Text("数据更新于：\(DateText.timestamp(store.lastUpdated))")
                .font(CineTheme.mono(9.5))
                .foregroundStyle(CineTheme.inkMuted)
            Text("共 \(store.filteredItems.count) 部 · 数据来自豆瓣 / TMDB / 猫眼 / Bilibili")
                .font(CineTheme.mono(9.5))
                .foregroundStyle(CineTheme.inkMuted)
            if store.isCurrentStale {
                Text("网络不可用，当前展示本地缓存副本。")
                    .font(CineTheme.mono(9.5))
                    .foregroundStyle(CineTheme.danger)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
