import Foundation
import Observation

@MainActor
@Observable
final class CatalogStore {
    var selectedCategory: CategoryID = .tvCn
    var rating: RatingSelection = .all
    var selectedGenres: Set<String> = []

    private(set) var itemsByCategory: [CategoryID: [CatalogItem]] = [:]
    private(set) var updatedAtByCategory: [CategoryID: Date] = [:]
    private(set) var staleCategories: Set<CategoryID> = []
    private(set) var loadingCategories: Set<CategoryID> = []
    private(set) var errorByCategory: [CategoryID: String] = [:]
    private var loadTasks: [CategoryID: Task<Void, Never>] = [:]

    private(set) var statuses: [String: DoubanStatusRecord] = [:]
    private(set) var statusesUpdatedAt: Date?
    private(set) var statusesLoaded = false
    private(set) var collectionLoading = false

    /// 深链解析出的目标条目，由发现页消费后清空。
    var pendingItem: CatalogItem?
    /// 深链指定的标签页 id（discover / collection / search），由根视图消费。
    var pendingTab: String?
    /// 深链带过来的搜索词，由搜索页消费。
    var pendingQuery: String?
    /// 深链要求进入详情后直接生成分享图，由详情页消费。
    var autoShareItemID: String?

    // MARK: - 读取

    var currentCategory: CategoryDefinition { Categories.definition(selectedCategory) }
    var currentItems: [CatalogItem] { itemsByCategory[selectedCategory] ?? [] }
    var isCurrentLoading: Bool { loadingCategories.contains(selectedCategory) }
    var currentError: String? { errorByCategory[selectedCategory] }
    var isCurrentStale: Bool { staleCategories.contains(selectedCategory) }
    var lastUpdated: Date? { updatedAtByCategory[selectedCategory] }

    var filteredItems: [CatalogItem] {
        CatalogFilter.apply(
            currentItems,
            category: currentCategory,
            state: CatalogFilterState(rating: rating, genres: selectedGenres)
        )
    }

    var sections: [CatalogSection] {
        CatalogFilter.sections(filteredItems, recentHighScore: rating == .recentHighScore)
    }

    var availableGenres: [String] { Genres.available(in: currentItems) }

    var ratingChoices: [RatingChoice] { currentCategory.allChoices }

    var ratingLabel: String {
        ratingChoices.first { $0.selection == rating }?.label ?? "全部"
    }

    func status(for item: CatalogItem) -> DoubanStatus? {
        guard let subjectID = subjectID(for: item), let record = statuses[subjectID] else { return nil }
        return DoubanStatus(rawValue: record.status)
    }

    // MARK: - 加载

    func load(category id: CategoryID, force: Bool = false) async {
        // 同一分类正在加载时直接等它完成：深链与首屏常常同时发起请求，
        // 早退会让 open(itemID:) 拿到空数组。
        if let running = loadTasks[id] {
            await running.value
            return
        }
        if !force, itemsByCategory[id] != nil { return }

        let task = Task { @MainActor in
            await performLoad(category: id)
        }
        loadTasks[id] = task
        await task.value
        loadTasks[id] = nil
    }

    private func performLoad(category id: CategoryID) async {
        loadingCategories.insert(id)
        errorByCategory[id] = nil
        defer { loadingCategories.remove(id) }

        do {
            let result = try await CatalogService.shared.load(category: Categories.definition(id))
            itemsByCategory[id] = result.items
            updatedAtByCategory[id] = result.updatedAt
            if result.stale {
                staleCategories.insert(id)
            } else {
                staleCategories.remove(id)
            }
        } catch {
            errorByCategory[id] = error.localizedDescription
        }
    }

    func select(category id: CategoryID) async {
        guard id != selectedCategory else { return }
        selectedCategory = id
        // 网页端切换分类会清空评分与类型筛选。
        rating = .all
        selectedGenres = []
        await load(category: id)
    }

    func refresh() async {
        await loadStatuses(force: true)
        await load(category: selectedCategory, force: true)
    }

    func loadStatuses(force: Bool = false) async {
        if statusesLoaded && !force { return }
        do {
            let result = try await CatalogService.shared.loadStatuses()
            statuses = result.statuses
            statusesUpdatedAt = result.updatedAt
            statusesLoaded = true
        } catch {
            // 收藏状态失败不应该阻塞片单，保持既有数据即可。
        }
    }

    /// 「我的」需要跨分类条目：逐个补齐分类，再合并豆瓣状态。
    func loadEverythingForCollections() async {
        guard !collectionLoading else { return }
        collectionLoading = true
        defer { collectionLoading = false }

        await loadStatuses()
        for category in Categories.all {
            await load(category: category.id)
        }
    }

    // MARK: - 筛选操作

    func setRating(_ selection: RatingSelection) {
        guard rating != selection else { return }
        rating = selection
    }

    func toggleGenre(_ genre: String) {
        if genre == "全部" {
            selectedGenres = []
        } else if selectedGenres.contains(genre) {
            selectedGenres.remove(genre)
        } else {
            selectedGenres.insert(genre)
        }
    }

    // MARK: - 收藏

    func collectionBuckets() -> [DoubanStatus: [DoubanCollectionEntry]] {
        var buckets: [DoubanStatus: [DoubanCollectionEntry]] = [
            .wishlist: [], .watching: [], .watched: []
        ]
        var seen = Set<String>()

        for category in Categories.all {
            for item in itemsByCategory[category.id] ?? [] {
                guard let subjectID = subjectID(for: item),
                      let record = statuses[subjectID],
                      let status = DoubanStatus(rawValue: record.status) else { continue }
                guard !seen.contains(subjectID) else { continue }
                seen.insert(subjectID)
                buckets[status, default: []].append(
                    DoubanCollectionEntry(subjectID: subjectID, item: item, markedAt: record.updatedAt ?? "")
                )
            }
        }

        buckets[.watched]?.sort { $0.item.date > $1.item.date }
        return buckets
    }

    func subjectID(for item: CatalogItem) -> String? {
        if let subject = item.doubanSubjectID, !subject.isEmpty { return subject }
        if let link = item.doubanLink,
           let range = link.range(of: #"subject/(\d+)"#, options: .regularExpression) {
            return String(link[range].dropFirst("subject/".count))
        }
        let prefix = item.rawID.split(separator: "-").first.map(String.init) ?? ""
        return prefix.isEmpty ? nil : prefix
    }

    // MARK: - 深链

    func handle(url: URL) async {
        guard url.scheme == "cinescope" else { return }
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let query = components?.queryItems ?? []
        let target = query.first(where: { $0.name == "id" })?.value

        switch url.host {
        case "item":
            if let target { await open(itemID: target) }
        case "share":
            if let target { await open(itemID: target, autoShare: true) }
        case "category":
            if let target, let category = CategoryID(rawValue: target) {
                await select(category: category)
            }
        case "tab":
            if let target { pendingTab = target }
        case "search":
            pendingTab = "search"
            if let keyword = query.first(where: { $0.name == "q" })?.value {
                pendingQuery = keyword
            }
        default:
            break
        }
    }

    private func open(itemID: String, autoShare: Bool = false) async {
        let parts = itemID.split(separator: ":", maxSplits: 1).map(String.init)
        guard parts.count == 2, let category = CategoryID(rawValue: parts[0]) else { return }

        selectedCategory = category
        await load(category: category)
        if let item = (itemsByCategory[category] ?? []).first(where: { $0.rawID == parts[1] }) {
            pendingItem = item
            if autoShare {
                autoShareItemID = item.id
            }
        }
    }
}
