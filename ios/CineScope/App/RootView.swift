import SwiftUI

enum AppTab: String, CaseIterable, Identifiable {
    case discover
    case collection
    case search

    var id: String { rawValue }

    var title: String {
        switch self {
        case .discover: return "发现"
        case .collection: return "我的"
        case .search: return "搜索"
        }
    }

    var icon: String {
        switch self {
        case .discover: return "square.grid.2x2"
        case .collection: return "bookmark"
        case .search: return "magnifyingglass"
        }
    }
}

struct RootView: View {
    @State private var store = CatalogStore()
    @State private var tab: AppTab = .discover
    @State private var visitedTabs: Set<AppTab> = [.discover]
    @State private var discoverPath = NavigationPath()
    @State private var collectionPath = NavigationPath()
    @State private var searchPath = NavigationPath()

    /// 详情页与收藏列表采用全屏阅读，进入二级页面后隐藏底栏。
    private var showsTabBar: Bool {
        switch tab {
        case .discover: return discoverPath.isEmpty
        case .collection: return collectionPath.isEmpty
        case .search: return searchPath.isEmpty
        }
    }

    var body: some View {
        ZStack {
            DiscoverView(store: store, path: $discoverPath)
                .opacity(tab == .discover ? 1 : 0)
                .allowsHitTesting(tab == .discover)
                .accessibilityHidden(tab != .discover)
            if visitedTabs.contains(.collection) {
                CollectionView(store: store, path: $collectionPath)
                    .opacity(tab == .collection ? 1 : 0)
                    .allowsHitTesting(tab == .collection)
                    .accessibilityHidden(tab != .collection)
            }
            if visitedTabs.contains(.search) {
                SearchView(store: store, path: $searchPath)
                    .opacity(tab == .search ? 1 : 0)
                    .allowsHitTesting(tab == .search)
                    .accessibilityHidden(tab != .search)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if showsTabBar {
                AppTabBar(selection: $tab)
                    .padding(.horizontal, 20)
                    .padding(.top, 5)
                    .padding(.bottom, 2)
            }
        }
        .background(PaperBackground())
        .environment(store)
        .preferredColorScheme(.light)
        .tint(CineTheme.ink)
        .task {
            await store.load(category: store.selectedCategory)
        }
        .task { await store.loadStatuses() }
        .onChange(of: tab) { _, value in
            visitedTabs.insert(value)
            UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        }
        .onOpenURL { url in
            Task { await store.handle(url: url) }
        }
        // 冷启动时 URL 可能先于视图出现被处理，onChange 不会补发，
        // 因此首次出现时也消费一次待处理导航。
        .onAppear { consumePendingNavigation() }
        .onChange(of: store.pendingItem) { _, _ in consumePendingNavigation() }
        .onChange(of: store.pendingTab) { _, _ in consumePendingNavigation() }
    }

    private func consumePendingNavigation() {
        if let item = store.pendingItem {
            store.pendingItem = nil
            tab = .discover
            discoverPath = NavigationPath()
            discoverPath.append(item)
            return
        }
        if let identifier = store.pendingTab {
            store.pendingTab = nil
            tab = AppTab(rawValue: identifier) ?? .discover
        }
    }
}

struct AppTabBar: View {
    @Binding var selection: AppTab
    @Namespace private var selectionAnimation
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: 4) {
            ForEach(AppTab.allCases) { tab in
                Button {
                    guard selection != tab else { return }
                    Haptics.tap()
                    withAnimation(CineMotion.smooth) { selection = tab }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: tab.icon)
                            .font(.system(size: 17, weight: selection == tab ? .semibold : .regular))
                        Text(tab.title)
                            .font(CineTheme.fixed(12, weight: selection == tab ? .semibold : .medium))
                    }
                    .foregroundStyle(selection == tab ? CineTheme.ink : CineTheme.inkMuted)
                    .padding(.vertical, 7)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background {
                        if selection == tab {
                            if reduceMotion {
                                Capsule().fill(CineTheme.accent)
                            } else {
                                Capsule().fill(CineTheme.accent)
                                    .matchedGeometryEffect(id: "tab-selection", in: selectionAnimation)
                            }
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(PressableStyle())
                .accessibilityLabel(tab.title)
                .accessibilityAddTraits(selection == tab ? .isSelected : [])
            }
        }
        .padding(6)
        .modifier(GlassSurface())
        .frame(maxWidth: 430)
    }
}
