import Foundation

struct CatalogFilterState: Hashable {
    var rating: RatingSelection = .all
    var genres: Set<String> = []
    var query: String = ""
    var year: String?
    var kind: MediaKind?

    var isActive: Bool {
        rating != .all || !genres.isEmpty || !query.trimmed.isEmpty || year != nil || kind != nil
    }
}

struct CatalogSection: Identifiable, Hashable {
    let id: String
    let title: String?
    let items: [CatalogItem]
}

/// 片单筛选与排序，语义与 `js/modules/filters.js` 一致。
enum CatalogFilter {
    static func apply(_ items: [CatalogItem],
                      category: CategoryDefinition,
                      state: CatalogFilterState,
                      now: Date = Date()) -> [CatalogItem] {
        let query = state.query.trimmed.lowercased()
        let recentHighScore = state.rating == .recentHighScore
        let threshold: Double = {
            if case .threshold(let value) = state.rating { return value }
            return 0
        }()

        var lowerBound: Date?
        if recentHighScore {
            let today = Calendar.current.startOfDay(for: now)
            lowerBound = Calendar.current.date(byAdding: .year, value: -category.specialYears, to: today)
        }

        let filtered = items.filter { item in
            if !query.isEmpty {
                let haystack = ([item.title, item.subtitle] + item.aka + item.genres + [item.overview])
                    .joined(separator: " ")
                    .lowercased()
                if !haystack.contains(query) { return false }
            }

            if state.rating != .all && !recentHighScore && item.effectiveRating < threshold {
                return false
            }

            if !state.genres.isEmpty {
                let matches = item.genres.contains { state.genres.contains($0) }
                if !matches { return false }
            }

            if recentHighScore {
                guard let lowerBound, let date = DateParsing.day(item.date), date >= lowerBound else { return false }
                if item.effectiveRating < category.specialMinRating { return false }
            }

            if let year = state.year, String(item.date.prefix(4)) != year { return false }

            if let kind = state.kind, item.kind != kind { return false }

            return true
        }

        return sorted(filtered, recentHighScore: recentHighScore)
    }

    private static func sorted(_ items: [CatalogItem], recentHighScore: Bool) -> [CatalogItem] {
        items.sorted { left, right in
            if recentHighScore, left.effectiveRating != right.effectiveRating {
                return left.effectiveRating > right.effectiveRating
            }
            if left.date != right.date {
                return left.date > right.date
            }
            return left.effectiveRating > right.effectiveRating
        }
    }

    /// 时间排序时分月分组；「近 2 年高分」按评分排序，不再分月。
    static func sections(_ items: [CatalogItem], recentHighScore: Bool) -> [CatalogSection] {
        if recentHighScore {
            return [CatalogSection(id: "recent", title: nil, items: items)]
        }

        var sections: [CatalogSection] = []
        var currentKey = ""
        var buffer: [CatalogItem] = []

        func flush() {
            guard !buffer.isEmpty else { return }
            sections.append(CatalogSection(id: currentKey, title: monthTitle(currentKey), items: buffer))
            buffer = []
        }

        for item in items {
            let key = item.monthKey
            if key != currentKey {
                flush()
                currentKey = key
            }
            buffer.append(item)
        }
        flush()
        return sections
    }

    static func monthTitle(_ key: String) -> String {
        let parts = key.split(separator: "-")
        guard parts.count >= 2, let year = Int(parts[0]), let month = Int(parts[1]) else { return key }
        return "\(year)年 \(month)月"
    }

    /// 搜索页的年份选项：按年份倒序，只保留合法四位年份。
    static func availableYears(in items: [CatalogItem]) -> [String] {
        var years = Set<String>()
        for item in items {
            let year = String(item.date.prefix(4))
            if year.count == 4, Int(year) != nil { years.insert(year) }
        }
        return years.sorted(by: >)
    }
}
