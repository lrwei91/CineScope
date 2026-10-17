import Foundation

/// 评分筛选选项。网页端的「全部 / > N 分 / 近 2 年高分」都是同一组阈值语义。
enum RatingSelection: Hashable {
    case all
    case threshold(Double)
    case recentHighScore
}

struct RatingChoice: Identifiable, Hashable {
    let label: String
    let selection: RatingSelection

    var id: String { label }
}

struct CategoryDefinition: Identifiable, Hashable {
    let id: CategoryID
    let label: String
    let kind: MediaKind
    let completePath: String
    let latestPath: String?
    let boxOfficePath: String?
    let tvHeatPath: String?
    let preferCompleteOnFirstLoad: Bool
    let ratings: [RatingChoice]
    let specialLabel: String
    let specialYears: Int
    let specialMinRating: Double

    var allChoices: [RatingChoice] {
        ratings + [RatingChoice(label: specialLabel, selection: .recentHighScore)]
    }
}

enum Categories {
    /// 顺序与网页端分类导航一致。
    static let all: [CategoryDefinition] = [
        CategoryDefinition(
            id: .tvCn, label: "国产剧", kind: .tv,
            completePath: "json/tv_cn_complete.json",
            latestPath: "json/tv_cn_latest.json",
            boxOfficePath: nil,
            tvHeatPath: "json/maoyan_tv_heat.json",
            preferCompleteOnFirstLoad: false,
            ratings: lowThresholds,
            specialLabel: "近 2 年高分",
            specialYears: 2,
            specialMinRating: 7
        ),
        CategoryDefinition(
            id: .movieCn, label: "院线电影", kind: .movie,
            completePath: "json/movie_cn_complete.json",
            latestPath: "json/movie_cn_latest.json",
            boxOfficePath: "json/maoyan_box_office.json",
            tvHeatPath: nil,
            preferCompleteOnFirstLoad: true,
            ratings: defaultThresholds,
            specialLabel: "近 2 年高分",
            specialYears: 2,
            specialMinRating: 0
        ),
        CategoryDefinition(
            id: .variety, label: "综艺", kind: .tv,
            completePath: "json/tv_cn_variety_complete.json",
            latestPath: "json/tv_cn_variety_latest.json",
            boxOfficePath: nil,
            tvHeatPath: nil,
            preferCompleteOnFirstLoad: false,
            ratings: defaultThresholds,
            specialLabel: "近 2 年高分",
            specialYears: 2,
            specialMinRating: 0
        ),
        CategoryDefinition(
            id: .tvKr, label: "韩剧", kind: .tv,
            completePath: "json/tv_kr_complete.json",
            latestPath: "json/tv_kr_latest.json",
            boxOfficePath: nil,
            tvHeatPath: nil,
            preferCompleteOnFirstLoad: false,
            ratings: lowThresholds,
            specialLabel: "近 2 年高分",
            specialYears: 2,
            specialMinRating: 7
        ),
        CategoryDefinition(
            id: .tvJp, label: "日剧", kind: .tv,
            completePath: "json/tv_jp_complete.json",
            latestPath: "json/tv_jp_latest.json",
            boxOfficePath: nil,
            tvHeatPath: nil,
            preferCompleteOnFirstLoad: false,
            ratings: lowThresholds,
            specialLabel: "近 2 年高分",
            specialYears: 2,
            specialMinRating: 7
        ),
        CategoryDefinition(
            id: .tvUs, label: "美剧", kind: .tv,
            completePath: "json/tv_us_complete.json",
            latestPath: "json/tv_us_latest.json",
            boxOfficePath: nil,
            tvHeatPath: nil,
            preferCompleteOnFirstLoad: false,
            ratings: defaultThresholds,
            specialLabel: "近 2 年高分",
            specialYears: 2,
            specialMinRating: 0
        ),
        CategoryDefinition(
            id: .doubanTop250, label: "豆瓣Top250", kind: .movie,
            completePath: "json/douban_top250.json",
            latestPath: nil,
            boxOfficePath: nil,
            tvHeatPath: nil,
            preferCompleteOnFirstLoad: true,
            ratings: top250Thresholds,
            specialLabel: "9 分以上经典",
            specialYears: 100,
            specialMinRating: 9
        )
    ]

    static let lookup: [CategoryID: CategoryDefinition] = Dictionary(
        uniqueKeysWithValues: all.map { ($0.id, $0) }
    )

    private static let defaultThresholds = [
        RatingChoice(label: "全部", selection: .all),
        RatingChoice(label: "> 9 分", selection: .threshold(9)),
        RatingChoice(label: "> 8 分", selection: .threshold(8)),
        RatingChoice(label: "> 7 分", selection: .threshold(7))
    ]

    private static let lowThresholds = [
        RatingChoice(label: "全部", selection: .all),
        RatingChoice(label: "> 8 分", selection: .threshold(8)),
        RatingChoice(label: "> 7 分", selection: .threshold(7)),
        RatingChoice(label: "> 6 分", selection: .threshold(6))
    ]

    private static let top250Thresholds = [
        RatingChoice(label: "全部", selection: .all),
        RatingChoice(label: "> 9 分", selection: .threshold(9)),
        RatingChoice(label: "> 8.5 分", selection: .threshold(8.5)),
        RatingChoice(label: "> 8 分", selection: .threshold(8))
    ]

    static func definition(_ id: CategoryID) -> CategoryDefinition {
        lookup[id] ?? all[0]
    }
}

/// 类型标签：显示映射、优先级排序与脏数据白名单，与 `config.js` 保持一致。
enum Genres {
    static let displayMap: [String: String] = [
        "Action": "动作",
        "Adventure": "冒险",
        "Action & Adventure": "动作冒险",
        "Animation": "动画",
        "Comedy": "喜剧",
        "Crime": "犯罪",
        "Documentary": "纪录片",
        "Drama": "剧情",
        "Family": "家庭",
        "Fantasy": "奇幻",
        "History": "历史",
        "Horror": "恐怖",
        "Kids": "儿童",
        "Music": "音乐",
        "Mystery": "悬疑",
        "Romance": "爱情",
        "Reality TV": "真人秀",
        "Reality": "真人秀",
        "Sci-Fi & Fantasy": "科幻 | 奇幻",
        "Science Fiction": "科幻",
        "Soap": "肥皂剧",
        "Talk": "脱口秀",
        "Thriller": "惊悚",
        "TV Movie": "电视电影",
        "War": "战争",
        "War & Politics": "战争政治",
        "Western": "西部"
    ]

    static let priority: [String] = [
        "喜剧", "悬疑", "犯罪", "动作冒险", "动作", "科幻 | 奇幻", "科幻",
        "家庭", "爱情", "历史", "古装", "惊悚", "恐怖", "纪录片", "真人秀",
        "战争", "战争政治", "音乐", "儿童", "冒险", "西部", "脱口秀",
        "肥皂剧", "电视电影", "剧情", "动画"
    ]

    static let valid: Set<String> = [
        "喜剧", "悬疑", "犯罪", "动作冒险", "动作", "科幻 | 奇幻", "科幻",
        "家庭", "爱情", "历史", "古装", "惊悚", "恐怖", "纪录片", "真人秀",
        "战争", "战争政治", "音乐", "儿童", "冒险", "西部", "脱口秀",
        "肥皂剧", "电视电影", "剧情", "动画", "奇幻", "灵异", "武侠",
        "都市", "青春", "职场", "校园", "励志", "治愈", "搞笑", "益智",
        "竞技", "生活", "社会", "政治", "军事", "灾难", "传记", "歌舞",
        "运动", "西部片", "黑色电影", "短片", "儿童剧", "青少年", "超自然",
        "心理", "悬疑惊悚", "动作喜剧", "科幻喜剧", "恐怖喜剧", "浪漫喜剧",
        "剧情喜剧", "历史剧", "古装剧", "现代剧", "奇幻剧", "科幻剧",
        "悬疑剧", "犯罪剧", "医疗剧", "律政剧", "警匪剧", "谍战", "宫廷",
        "仙侠", "玄幻", "穿越", "重生", "甜宠", "虐恋", "偶像", "伦理",
        "家庭剧", "情感", "冒险剧", "战争剧", "历史战争", "动作犯罪",
        "悬疑犯罪", "科幻动作", "奇幻冒险"
    ]

    static func display(_ name: String) -> String {
        displayMap[name] ?? name
    }

    static func priorityIndex(_ name: String) -> Int {
        priority.firstIndex(of: display(name)) ?? -1
    }

    /// 与网页端 `sortGenresByPriority` 相同：已在优先级表内的按表排序，其余按中文顺序。
    static func sorted(_ names: [String]) -> [String] {
        names.sorted { left, right in
            let leftIndex = priorityIndex(left)
            let rightIndex = priorityIndex(right)
            if leftIndex != -1 || rightIndex != -1 {
                if leftIndex == -1 { return false }
                if rightIndex == -1 { return true }
                return leftIndex < rightIndex
            }
            return display(left).localizedCompare(display(right)) == .orderedAscending
        }
    }

    static func available(in items: [CatalogItem]) -> [String] {
        var seen = Set<String>()
        var unique: [String] = []
        for item in items {
            for genre in item.genres where !seen.contains(genre) {
                seen.insert(genre)
                unique.append(genre)
            }
        }
        return sorted(unique)
    }
}
