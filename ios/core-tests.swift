import Foundation

// 归一化与筛选逻辑的离线回归：直接读取仓库里的真实 JSON，
// 不依赖网络与模拟器。运行方式见 ios/README.md。

@main
struct CatalogCoreTests {
    static var failures = 0
    static var passes = 0

    static func check(_ condition: Bool, _ name: String, detail: String = "") {
        if condition {
            passes += 1
            print("PASS  \(name)")
        } else {
            failures += 1
            print("FAIL  \(name) \(detail)")
        }
    }

    static func load(_ file: String, _ category: CategoryID) throws -> (items: [CatalogItem], updated: Date?) {
        let root = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "json"
        let url = URL(fileURLWithPath: root).appendingPathComponent(file)
        let data = try Data(contentsOf: url)
        let result = try CatalogNormalizer.normalize(data: data, category: Categories.definition(category))
        return (result.items, result.updatedAt)
    }

    /// 从「更新至 N 集」里取出 N。
    static func updatedEpisodes(in status: String) -> String {
        status.unicodeScalars.filter { $0.properties.numericType == .decimal }.map(String.init).joined()
    }

    static func main() {
        do {
            try run()
        } catch {
            print("ERROR \(error)")
            exit(1)
        }

        print("")
        print("\(passes) passed, \(failures) failed")
        exit(failures == 0 ? 0 : 1)
    }

    static func run() throws {
        let tv = try load("tv_cn_complete.json", .tvCn)
        check(tv.items.count > 300, "国产剧按季展开", detail: "count=\(tv.items.count)")
        check(tv.updated != nil, "读取 metadata.last_updated")
        check(tv.items.allSatisfy { !$0.date.isEmpty }, "全部条目都有上映日期")
        check(Set(tv.items.map(\.id)).count == tv.items.count, "条目 id 唯一")
        check(tv.items.allSatisfy { !($0.genres.contains("动画") && $0.effectiveRating == 0) },
              "动画无评分条目被过滤")
        check(tv.items.contains { $0.posterStatusLabel == "连载中" }, "国产剧保留连载中标签")
        check(tv.items.allSatisfy { $0.genres.allSatisfy(Genres.valid.contains) }, "类型全部命中白名单")

        let movies = try load("movie_cn_complete.json", .movieCn)
        check(movies.items.count > 500, "院线电影数量", detail: "count=\(movies.items.count)")
        check(movies.items.allSatisfy { $0.kind == .movie }, "院线电影均为 movie")
        check(movies.items.allSatisfy { $0.categoryID == .movieCn }, "分类标记正确")
        check(movies.items.contains { !$0.aka.isEmpty }, "别名被保留")
        check(movies.items.contains { !$0.trailers.isEmpty }, "预告片被保留")

        let top = try load("douban_top250.json", .doubanTop250)
        check(top.items.count == 250, "Top250 保留 250 条", detail: "count=\(top.items.count)")
        check(top.items.contains { $0.title == "肖申克的救赎" && $0.verifiedRating == 9.7 },
              "Top250 评分解析（字符串转数字）")

        let variety = try load("tv_cn_variety_complete.json", .variety)
        check(variety.items.count > 30, "综艺条目可解析", detail: "count=\(variety.items.count)")

        // 总集数与更新进度必须分开：旧数据把「更新至 N 集」当成总数。
        let airing = tv.items.filter { $0.detailStatus.contains("更新至") }
        check(!airing.isEmpty, "存在连载中的国产剧", detail: "count=\(airing.count)")
        check(airing.allSatisfy { $0.detailRuntime.isEmpty || $0.detailRuntime.hasPrefix("共 ") },
              "总集数统一带「共」前缀")
        let suspicious = airing.filter { item in
            let total = item.detailRuntime
                .replacingOccurrences(of: "共 ", with: "")
                .replacingOccurrences(of: " 集", with: "")
            return total == updatedEpisodes(in: item.detailStatus)
        }
        check(suspicious.isEmpty, "总集数不再等于更新集数", detail: suspicious.map(\.title).joined(separator: "、"))
        check(airing.contains { $0.rawID == "37191789" && $0.detailRuntime == "共 30 集" },
              "连载剧读取到豆瓣总集数")

        let tvCategory = Categories.definition(.tvCn)
        let movieCategory = Categories.definition(.movieCn)

        let rating8 = CatalogFilter.apply(movies.items, category: movieCategory,
                                          state: CatalogFilterState(rating: .threshold(8), genres: [], query: ""))
        check(!rating8.isEmpty && rating8.allSatisfy { $0.effectiveRating >= 8 }, "评分筛选保留 >= 8")
        check(rating8.count < movies.items.count, "评分筛选确实缩小了结果")

        let action = CatalogFilter.apply(movies.items, category: movieCategory,
                                         state: CatalogFilterState(genres: ["动作"], query: ""))
        check(!action.isEmpty && action.allSatisfy { $0.genres.contains("动作") }, "类型筛选命中动作")

        let searched = CatalogFilter.apply(movies.items, category: movieCategory,
                                           state: CatalogFilterState(query: "复仇者"))
        check(!searched.isEmpty && searched.allSatisfy {
            ([$0.title, $0.subtitle] + $0.aka + $0.genres + [$0.overview])
                .joined(separator: " ").lowercased().contains("复仇者")
        }, "关键词搜索命中标题或别名")

        let dates = rating8.map(\.date)
        check(dates == dates.sorted(by: >), "默认按上映日期倒序")

        let sections = CatalogFilter.sections(rating8, recentHighScore: false)
        check(sections.count > 1, "跨月片单切分为多个月份", detail: "sections=\(sections.count)")
        check(sections.allSatisfy { !$0.items.isEmpty }, "没有空月份分组")
        check(sections.map(\.id) == sections.map(\.id).sorted(by: >), "月份倒序且不重复")

        let recent = CatalogFilter.apply(tv.items, category: tvCategory,
                                         state: CatalogFilterState(rating: .recentHighScore, genres: [], query: ""))
        let limit = Calendar.current.date(byAdding: .year, value: -2, to: Date())!
        check(!recent.isEmpty, "近 2 年高分有结果", detail: "count=\(recent.count)")
        check(recent.allSatisfy { ($0.effectiveRating) >= tvCategory.specialMinRating }, "近 2 年高分满足最低评分")
        check(recent.allSatisfy { DateParsing.day($0.date).map { $0 >= limit } ?? false }, "近 2 年高分满足时间窗口")
        let recentRatings = recent.map(\.effectiveRating)
        check(recentRatings == recentRatings.sorted(by: >), "高分模式按评分倒序")

        let recentSections = CatalogFilter.sections(recent, recentHighScore: true)
        check(recentSections.count == 1 && recentSections[0].title == nil, "高分模式不再按月分组")

        let years = CatalogFilter.availableYears(in: movies.items)
        check(!years.isEmpty && years == years.sorted(by: >), "年份选项倒序")
        check(years.allSatisfy { $0.count == 4 && Int($0) != nil }, "年份选项合法")

        let embed = CatalogNormalizer.embedURL(raw: "https://player.bilibili.com/player.html?bvid=BV1xx", bvid: "BV1xx")
        check(embed.contains("high_quality=1") && embed.contains("page=1"), "预告片 embed 参数补齐")

        let normalized = CatalogNormalizer.normalizeText("  Avengers: Endgame (2019) ")
        check(normalized == "avengersendgame2019", "标题归一化（去空格与标点）", detail: normalized)
    }
}
