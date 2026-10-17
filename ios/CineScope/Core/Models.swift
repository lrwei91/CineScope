import Foundation

/// 片单分类，与网页端 `CATEGORY_CONFIG` 的 id 一一对应。
enum CategoryID: String, CaseIterable, Identifiable, Hashable {
    case tvCn = "tv_cn"
    case movieCn = "movie_cn"
    case variety = "tv_cn_variety"
    case tvKr = "tv_kr"
    case tvJp = "tv_jp"
    case tvUs = "tv_us"
    case doubanTop250 = "douban_top250"

    var id: String { rawValue }
}

enum MediaKind: String, Hashable {
    case movie
    case tv
}

struct Trailer: Hashable, Identifiable {
    let title: String
    let bvid: String
    let url: String
    let embedURL: String

    var id: String { bvid.isEmpty ? url : bvid }
}

struct ReleaseWindow: Hashable, Identifiable {
    let id: String
    let label: String
}

/// 猫眼实时票房，只在院线电影上出现。
struct BoxOffice: Hashable {
    let rank: Int?
    let realTimeBoxOffice: String
    let cumulativeBoxOffice: String
    let boxOfficeRate: String
    let showCountRate: String

    var headline: String {
        if !realTimeBoxOffice.isEmpty { return realTimeBoxOffice }
        return cumulativeBoxOffice.isEmpty ? "暂无" : cumulativeBoxOffice
    }
}

/// 猫眼剧集热度，只在国产剧上出现。
struct TVHeat: Hashable {
    let rank: Int?
    let currHeat: String
    let currHeatDesc: String
    let platformDesc: String
    let releaseInfo: String

    var headline: String { currHeatDesc.isEmpty ? currHeat : currHeatDesc }
}

/// 归一化后的片单条目。网页端把剧集按季拆成独立条目，这里保持同一语义。
struct CatalogItem: Hashable, Identifiable {
    let rawID: String
    let kind: MediaKind
    let categoryID: CategoryID
    let date: String
    let title: String
    let subtitle: String
    let posterPath: String?
    let genres: [String]
    let networks: [String]
    let doubanRating: Double?
    let doubanLink: String?
    let doubanSubjectID: String?
    let doubanVerified: Bool
    let tmdbID: Int?
    let imdbID: String?
    let tmdbURL: String?
    let imdbURL: String?
    let directors: [String]
    let actors: [String]
    let countries: [String]
    let languages: [String]
    let aka: [String]
    let overview: String
    let trailers: [Trailer]
    let releaseWindows: [ReleaseWindow]
    let posterStatusLabel: String?
    let detailStatus: String
    let detailRuntime: String
    let ratingCount: Int?
    let boxOffice: BoxOffice?
    let tvHeat: TVHeat?
    let ratingStarCount: Int?

    /// 深链需要跨分类唯一，因此带上分类前缀。
    var id: String { "\(categoryID.rawValue):\(rawID)" }

    var year: String { String(date.prefix(4)) }
    var monthKey: String { String(date.prefix(7)) }

    /// 网页端只在「已验证且有条目评分」时展示分数，否则写「暂无评分」。
    var verifiedRating: Double? {
        guard doubanVerified, let rating = doubanRating, rating > 0 else { return nil }
        return rating
    }

    var ratingText: String {
        guard let rating = verifiedRating else { return "暂无评分" }
        return String(format: "%.1f", rating)
    }

    var effectiveRating: Double { doubanRating ?? 0 }

    var dateText: String { date.isEmpty ? "上映日期待定" : date }

    var kindLabel: String { kind == .tv ? "剧集" : "电影" }

    /// 卡片上的两枚标签：先档期，再优先级最高的类型。
    var chipLabels: [String] {
        var labels: [String] = []
        if let window = releaseWindows.first { labels.append(window.label) }
        if let genre = Genres.sorted(genres).first { labels.append(Genres.display(genre)) }
        return Array(labels.prefix(2))
    }

    /// 猫眼实时数据在片单加载后合并进来，其余字段保持不变。
    func copy(boxOffice: BoxOffice? = nil, tvHeat: TVHeat? = nil) -> CatalogItem {
        CatalogItem(
            rawID: rawID, kind: kind, categoryID: categoryID, date: date,
            title: title, subtitle: subtitle, posterPath: posterPath,
            genres: genres, networks: networks,
            doubanRating: doubanRating, doubanLink: doubanLink,
            doubanSubjectID: doubanSubjectID, doubanVerified: doubanVerified,
            tmdbID: tmdbID, imdbID: imdbID, tmdbURL: tmdbURL, imdbURL: imdbURL,
            directors: directors, actors: actors, countries: countries,
            languages: languages, aka: aka, overview: overview,
            trailers: trailers, releaseWindows: releaseWindows,
            posterStatusLabel: posterStatusLabel, detailStatus: detailStatus,
            detailRuntime: detailRuntime, ratingCount: ratingCount,
            boxOffice: boxOffice ?? self.boxOffice,
            tvHeat: tvHeat ?? self.tvHeat,
            ratingStarCount: ratingStarCount
        )
    }
}

/// 豆瓣收藏记录，来自 `json/douban_statuses.json`。
struct DoubanStatusRecord: Codable, Hashable {
    let status: String
    let updatedAt: String?
}

struct DoubanCollectionEntry: Identifiable, Hashable {
    let subjectID: String
    let item: CatalogItem
    let markedAt: String

    var id: String { subjectID }
}

enum DoubanStatus: String, CaseIterable {
    case wishlist
    case watching
    case watched

    var label: String {
        switch self {
        case .wishlist: return "想看"
        case .watching: return "在看"
        case .watched: return "看过"
        }
    }
}
