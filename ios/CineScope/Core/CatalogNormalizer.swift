import Foundation

enum CatalogError: LocalizedError {
    case invalidPayload(String)
    case network(String)

    var errorDescription: String? {
        switch self {
        case .invalidPayload(let message): return message
        case .network(let message): return message
        }
    }
}

struct NormalizedPayload {
    let items: [CatalogItem]
    let updatedAt: Date?
}

/// 把网页端生成的 JSON 归一化成原生条目。
/// 规则与 `js/modules/data-loader.js` 对齐：剧集按季展开、按豆瓣/TMDB/IMDb 去重合并、
/// 类型走白名单、动画无评分不进入片单。
enum CatalogNormalizer {
    static func normalize(data: Data, category: CategoryDefinition, now: Date = Date()) throws -> NormalizedPayload {
        let payload: PayloadDTO
        do {
            payload = try JSONDecoder().decode(PayloadDTO.self, from: data)
        } catch {
            throw CatalogError.invalidPayload("数据结构无法解析：\(error.localizedDescription)")
        }

        let updatedAt = payload.metadata?.lastUpdated.flatMap(DateParsing.timestamp)

        var items: [CatalogItem] = []
        switch category.kind {
        case .tv:
            guard let shows = payload.shows else {
                throw CatalogError.invalidPayload("剧集数据缺少 shows 数组")
            }
            items = shows.flatMap { tvItems(from: $0, category: category, now: now) }
        case .movie:
            guard let movies = payload.movies else {
                throw CatalogError.invalidPayload("电影数据缺少 movies 数组")
            }
            items = movies.compactMap { movieItem(from: $0, category: category) }
        }

        items = items.filter(animationFilter)

        return NormalizedPayload(items: dedupe(items), updatedAt: updatedAt)
    }

    // MARK: - 剧集

    private static func tvItems(from show: ShowDTO, category: CategoryDefinition, now: Date) -> [CatalogItem] {
        let displayTitle = localizedTitle(name: show.name, originalName: show.originalName)
        let showID = show.id?.string ?? ""
        let genres = genreNames(show.genres)
        let networks = nameList(show.networks)
        let directors = nameList(show.directors)
        let actors = nameList(show.actors)
        let countries = stringList(show.countries)
        let languages = stringList(show.languages)
        let aka = stringList(show.aka)
        let trailers = trailerList(show.trailers)
        let statusLabel = category.id == .tvCn ? posterStatusLabel(for: show, now: now) : nil
        let tmdbID = show.tmdbID?.value.flatMap { Int($0) }
        let ratingCount = show.ratingCount?.value.flatMap { Int($0) }
        let ratingStarCount = show.ratingStarCount?.value.flatMap { Int($0) }

        return (show.seasons ?? []).compactMap { season in
            guard let airDate = season.airDate?.trimmed, !airDate.isEmpty else { return nil }

            let seasonID = season.id?.string ?? ""
            let rawID: String
            if !seasonID.isEmpty, seasonID != "0" {
                rawID = seasonID
            } else {
                rawID = "\(showID)-\(season.seasonNumber ?? 0)-\(airDate)"
            }

            let seasonName = season.name?.trimmed ?? ""
            let subtitle = show.originalName != show.name
                ? (show.originalName?.trimmed ?? "")
                : seasonName
            let poster = season.posterPath ?? show.posterPath
            let doubanLink = season.doubanLink
            let overview = (show.overview?.trimmed.isEmpty == false ? show.overview : season.overview) ?? ""
            let imdbID = show.imdbID.flatMap { $0.trimmed.nilIfEmpty }

            return CatalogItem(
                rawID: rawID,
                kind: .tv,
                categoryID: category.id,
                date: airDate,
                title: displayTitle,
                subtitle: subtitle,
                posterPath: poster,
                genres: genres,
                networks: networks,
                doubanRating: season.doubanRating?.value,
                doubanLink: doubanLink,
                doubanSubjectID: doubanSubjectID(from: doubanLink),
                doubanVerified: season.doubanVerified ?? false,
                tmdbID: tmdbID,
                imdbID: imdbID,
                tmdbURL: tmdbID.map { "https://www.themoviedb.org/tv/\($0)" },
                imdbURL: imdbID.map { "https://www.imdb.com/title/\($0)/" },
                directors: directors,
                actors: actors,
                countries: countries,
                languages: languages,
                aka: aka,
                overview: overview,
                trailers: trailers,
                releaseWindows: [],
                posterStatusLabel: statusLabel,
                detailStatus: show.episodesInfo.flatMap { $0.trimmed.nilIfEmpty }
                    ?? show.status.flatMap { $0.trimmed.nilIfEmpty }
                    ?? "",
                detailRuntime: (show.numberOfEpisodes ?? 0) > 0 ? "共 \(show.numberOfEpisodes ?? 0) 集" : "",
                ratingCount: ratingCount == 0 ? nil : ratingCount,
                boxOffice: nil,
                tvHeat: nil,
                ratingStarCount: ratingStarCount == 0 ? nil : ratingStarCount
            )
        }
    }

    /// 与 `resolveTvPosterStatusLabel` 相同的判定：明确完结、集数齐全且久未更新都视为已完结。
    static func posterStatusLabel(for show: ShowDTO, now: Date) -> String? {
        let statusValue = (show.status ?? "").trimmed
        let episodesInfo = (show.episodesInfo ?? "").trimmed
        let statusText = statusValue.isEmpty ? episodesInfo : statusValue
        let lowered = statusValue.lowercased()
        let totalEpisodes = show.numberOfEpisodes ?? 0

        let updatedEpisodes = firstMatch(#"更新至\s*(\d+)\s*集"#, in: statusText).flatMap { Int($0) }
        let lastAirDate = show.lastAirDate.flatMap(DateParsing.day)
        let daysSinceLastAir = lastAirDate.map { Calendar.current.dateComponents([.day], from: $0, to: now).day ?? 0 }

        let explicitEnded = ["ended", "canceled", "cancelled"].contains(lowered)
        let explicitReturning = lowered.contains("returning series")
        let endedByEpisodeText = firstMatch(#"\d+\s*集全"#, in: statusText) != nil

        let endedByStaleUpdate: Bool = {
            guard let updatedEpisodes, totalEpisodes > 0, let daysSinceLastAir else { return false }
            return updatedEpisodes >= totalEpisodes && daysSinceLastAir > 14
        }()

        let endedByStaleReturningSeason: Bool = {
            guard let daysSinceLastAir, daysSinceLastAir > 14 else { return false }
            return explicitReturning || show.inProduction == true
        }()

        if explicitEnded || endedByEpisodeText || endedByStaleUpdate || endedByStaleReturningSeason {
            return nil
        }

        if statusText.contains("更新至") || statusText.contains("连载中") || statusText.contains("连載中")
            || explicitReturning || lowered.contains("in production") {
            return "连载中"
        }

        if show.inProduction == true { return "连载中" }
        return nil
    }

    // MARK: - 电影

    private static func movieItem(from movie: MovieDTO, category: CategoryDefinition) -> CatalogItem? {
        guard let releaseDate = (movie.releaseDate ?? movie.airDate ?? movie.firstAirDate)?.trimmed,
              !releaseDate.isEmpty else { return nil }

        let primaryTitle = (movie.title ?? movie.name ?? movie.originalTitle ?? movie.originalName ?? "未命名").trimmed
        let originalTitle = (movie.originalTitle ?? movie.originalName ?? primaryTitle).trimmed
        let tmdbID = movie.tmdbID?.value.flatMap { Int($0) }
        let trailers = trailerList(movie.trailers)
        let doubanLink = movie.doubanLink
        let ratingCount = movie.ratingCount?.value.flatMap { Int($0) }
        let ratingStarCount = movie.ratingStarCount?.value.flatMap { Int($0) }
        let imdbID = movie.imdbID.flatMap { $0.trimmed.nilIfEmpty }

        return CatalogItem(
            rawID: movie.id?.string ?? "\(primaryTitle)-\(releaseDate)",
            kind: .movie,
            categoryID: category.id,
            date: releaseDate,
            title: primaryTitle.isEmpty ? "未命名" : primaryTitle,
            subtitle: primaryTitle != originalTitle ? originalTitle : "",
            posterPath: movie.posterPath,
            genres: genreNames(movie.genres),
            networks: [],
            doubanRating: movie.doubanRating?.value,
            doubanLink: doubanLink,
            doubanSubjectID: doubanSubjectID(from: doubanLink),
            doubanVerified: movie.doubanVerified ?? false,
            tmdbID: tmdbID,
            imdbID: imdbID,
            tmdbURL: tmdbID.map { "https://www.themoviedb.org/movie/\($0)" },
            imdbURL: imdbID.map { "https://www.imdb.com/title/\($0)/" },
            directors: nameList(movie.directors),
            actors: nameList(movie.actors),
            countries: stringList(movie.countries),
            languages: stringList(movie.languages),
            aka: stringList(movie.aka),
            overview: movie.overview?.trimmed ?? "",
            trailers: trailers,
            releaseWindows: releaseWindows(movie.releaseWindows),
            posterStatusLabel: nil,
            detailStatus: "",
            detailRuntime: stringList(movie.durations).first ?? "",
            ratingCount: ratingCount == 0 ? nil : ratingCount,
            boxOffice: nil,
            tvHeat: nil,
            ratingStarCount: ratingStarCount == 0 ? nil : ratingStarCount
        )
    }

    // MARK: - 去重合并

    private static func dedupe(_ items: [CatalogItem]) -> [CatalogItem] {
        var result: [CatalogItem] = []
        var indexByKey: [String: Int] = [:]

        for item in items {
            let key = dedupeKey(item)
            if let index = indexByKey[key] {
                result[index] = merge(result[index], item)
            } else {
                indexByKey[key] = result.count
                result.append(item)
            }
        }
        return result
    }

    private static func dedupeKey(_ item: CatalogItem) -> String {
        if let subject = item.doubanSubjectID { return "\(item.kind.rawValue)::douban::\(subject)" }
        if let tmdb = item.tmdbID { return "\(item.kind.rawValue)::tmdb::\(tmdb)" }
        if let imdb = item.imdbID { return "\(item.kind.rawValue)::imdb::\(imdb)" }

        let normalizedTitle = normalizeText(item.title)
        let normalizedSubtitle = normalizeText(item.subtitle)
        if item.kind == .movie {
            return "movie::\(normalizedTitle)::\(String(item.date.prefix(7)))"
        }
        return "tv::\(normalizedTitle)::\(normalizedSubtitle)::\(item.date)"
    }

    private static func merge(_ left: CatalogItem, _ right: CatalogItem) -> CatalogItem {
        let preferred = score(right) > score(left) ? right : left
        let secondary = preferred.rawID == right.rawID ? left : right

        let trailers = mergeTrailers(preferred.trailers, secondary.trailers)
        let releaseWindows = mergeWindows(preferred.releaseWindows, secondary.releaseWindows)

        return CatalogItem(
            rawID: preferred.rawID,
            kind: preferred.kind,
            categoryID: preferred.categoryID,
            date: preferred.date.isEmpty ? secondary.date : preferred.date,
            title: preferred.title.isEmpty ? secondary.title : preferred.title,
            subtitle: preferred.subtitle.isEmpty ? secondary.subtitle : preferred.subtitle,
            posterPath: preferred.posterPath ?? secondary.posterPath,
            genres: mergeUnique(preferred.genres, secondary.genres),
            networks: mergeUnique(preferred.networks, secondary.networks),
            doubanRating: preferred.doubanRating ?? secondary.doubanRating,
            doubanLink: preferred.doubanLink ?? secondary.doubanLink,
            doubanSubjectID: preferred.doubanSubjectID ?? secondary.doubanSubjectID,
            doubanVerified: preferred.doubanVerified || secondary.doubanVerified,
            tmdbID: preferred.tmdbID ?? secondary.tmdbID,
            imdbID: preferred.imdbID ?? secondary.imdbID,
            tmdbURL: preferred.tmdbURL ?? secondary.tmdbURL,
            imdbURL: preferred.imdbURL ?? secondary.imdbURL,
            directors: mergeUnique(preferred.directors, secondary.directors),
            actors: mergeUnique(preferred.actors, secondary.actors),
            countries: mergeUnique(preferred.countries, secondary.countries),
            languages: mergeUnique(preferred.languages, secondary.languages),
            aka: mergeUnique(preferred.aka, secondary.aka),
            overview: preferred.overview.isEmpty ? secondary.overview : preferred.overview,
            trailers: trailers,
            releaseWindows: releaseWindows,
            posterStatusLabel: preferred.posterStatusLabel ?? secondary.posterStatusLabel,
            detailStatus: preferred.detailStatus.isEmpty ? secondary.detailStatus : preferred.detailStatus,
            detailRuntime: preferred.detailRuntime.isEmpty ? secondary.detailRuntime : preferred.detailRuntime,
            ratingCount: preferred.ratingCount ?? secondary.ratingCount,
            boxOffice: preferred.boxOffice ?? secondary.boxOffice,
            tvHeat: preferred.tvHeat ?? secondary.tvHeat,
            ratingStarCount: preferred.ratingStarCount ?? secondary.ratingStarCount
        )
    }

    private static func score(_ item: CatalogItem) -> Double {
        var score = 0.0
        if item.doubanVerified { score += 4 }
        if item.doubanRating != nil { score += 3 }
        if item.doubanLink != nil { score += 2 }
        if item.tmdbURL != nil { score += 1 }
        if item.imdbURL != nil { score += 1 }
        if item.posterPath != nil { score += 1 }
        if !item.subtitle.isEmpty { score += 1 }
        score += Double(item.genres.count) * 0.1
        score += Double(item.networks.count) * 0.1
        return score
    }

    private static func mergeUnique(_ left: [String], _ right: [String]) -> [String] {
        var seen = Set<String>()
        var result: [String] = []
        for value in left + right where !value.isEmpty && !seen.contains(value) {
            seen.insert(value)
            result.append(value)
        }
        return result
    }

    private static func mergeWindows(_ left: [ReleaseWindow], _ right: [ReleaseWindow]) -> [ReleaseWindow] {
        var seen = Set<String>()
        var result: [ReleaseWindow] = []
        for window in left + right where !seen.contains(window.id) {
            seen.insert(window.id)
            result.append(window)
        }
        return result
    }

    private static func mergeTrailers(_ left: [Trailer], _ right: [Trailer]) -> [Trailer] {
        var seen = Set<String>()
        var result: [Trailer] = []
        for trailer in left + right {
            let key = trailer.bvid.isEmpty ? trailer.url : trailer.bvid
            guard !key.isEmpty, !seen.contains(key) else { continue }
            seen.insert(key)
            result.append(trailer)
        }
        return result
    }

    // MARK: - 字段清洗

    static func normalizeText(_ value: String) -> String {
        let stripped = value.lowercased().unicodeScalars.filter { scalar in
            !CharacterSet.whitespacesAndNewlines.contains(scalar)
                && !"：:·•'\".,，、!！?？-—_()（）[]【】".unicodeScalars.contains(scalar)
        }
        return String(String.UnicodeScalarView(stripped))
    }

    private static func localizedTitle(name: String?, originalName: String?) -> String {
        let name = name?.trimmed ?? ""
        let original = originalName?.trimmed ?? ""
        if name.isEmpty && original.isEmpty { return "未命名" }
        if name.isEmpty { return original }
        if original.isEmpty || name == original { return name }
        return "\(name) (\(original))"
    }

    private static func genreNames(_ list: [NameDTO]?) -> [String] {
        nameList(list).filter { Genres.valid.contains($0) }
    }

    private static func nameList(_ list: [NameDTO]?) -> [String] {
        (list ?? []).compactMap { $0.name.flatMap { $0.trimmed.nilIfEmpty } }
    }

    private static func stringList(_ list: [String]?) -> [String] {
        (list ?? []).compactMap { $0.trimmed.nilIfEmpty }
    }

    private static func releaseWindows(_ list: [WindowDTO]?) -> [ReleaseWindow] {
        (list ?? []).compactMap { window in
            guard let id = window.id.flatMap({ $0.trimmed.nilIfEmpty }),
                  let label = window.label.flatMap({ $0.trimmed.nilIfEmpty }) else { return nil }
            return ReleaseWindow(id: id, label: label)
        }
    }

    private static func trailerList(_ list: [TrailerDTO]?) -> [Trailer] {
        (list ?? []).compactMap { raw in
            let title = stripTags(raw.title ?? "").trimmed
            let bvid = raw.bvid?.trimmed ?? ""
            let url = raw.url?.trimmed ?? ""
            guard !title.isEmpty, !bvid.isEmpty || !url.isEmpty else { return nil }
            return Trailer(
                title: title,
                bvid: bvid,
                url: url,
                embedURL: embedURL(raw: raw.embedURL ?? raw.embed_url ?? "", bvid: bvid)
            )
        }
    }

    static func embedURL(raw: String, bvid: String) -> String {
        let trimmed = raw.trimmed
        if trimmed.isEmpty && bvid.isEmpty { return "" }

        var value = trimmed.isEmpty ? "https://player.bilibili.com/player.html" : trimmed
        if URLComponents(string: value)?.scheme == nil {
            value = "https://player.bilibili.com/player.html"
        }
        guard var components = URLComponents(string: value) else { return "" }

        var query = components.queryItems ?? []
        func appendIfMissing(_ name: String, _ value: String) {
            if !query.contains(where: { $0.name == name }) {
                query.append(URLQueryItem(name: name, value: value))
            }
        }
        if !bvid.isEmpty { appendIfMissing("bvid", bvid) }
        appendIfMissing("page", "1")
        appendIfMissing("qn", "64")
        appendIfMissing("high_quality", "1")
        components.queryItems = query
        return components.url?.absoluteString ?? ""
    }

    private static func stripTags(_ value: String) -> String {
        value.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
    }

    private static func doubanSubjectID(from link: String?) -> String? {
        guard let link, let range = link.range(of: #"subject/(\d+)"#, options: .regularExpression) else {
            return nil
        }
        return String(link[range].dropFirst("subject/".count))
    }

    private static func firstMatch(_ pattern: String, in text: String) -> String? {
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) else {
            return nil
        }
        guard match.numberOfRanges > 1, let range = Range(match.range(at: 1), in: text) else {
            return match.range.location == NSNotFound ? nil : text
        }
        return String(text[range])
    }

    /// 网页端的隐含规则：动画条目没有评分时不进入片单。
    private static let animationFilter: (CatalogItem) -> Bool = { item in
        if item.genres.contains(where: { Genres.display($0) == "动画" }), item.effectiveRating <= 0 {
            return false
        }
        return true
    }
}

// MARK: - 原始 JSON 结构

private struct PayloadDTO: Decodable {
    let metadata: MetadataDTO?
    let movies: [MovieDTO]?
    let shows: [ShowDTO]?
}

private struct MetadataDTO: Decodable {
    let lastUpdated: String?

    enum CodingKeys: String, CodingKey {
        case lastUpdated = "last_updated"
    }
}

struct NameDTO: Decodable {
    let name: String?
}

struct WindowDTO: Decodable {
    let id: String?
    let label: String?
}

struct TrailerDTO: Decodable {
    let title: String?
    let bvid: String?
    let url: String?
    let embedURL: String?
    let embed_url: String?
}

struct MovieDTO: Decodable {
    let id: FlexibleID?
    let title: String?
    let name: String?
    let originalTitle: String?
    let originalName: String?
    let releaseDate: String?
    let airDate: String?
    let firstAirDate: String?
    let genres: [NameDTO]?
    let directors: [NameDTO]?
    let actors: [NameDTO]?
    let countries: [String]?
    let languages: [String]?
    let aka: [String]?
    let imdbID: String?
    let posterPath: String?
    let doubanRating: FlexibleDouble?
    let doubanLink: String?
    let doubanVerified: Bool?
    let overview: String?
    let durations: [String]?
    let releaseWindows: [WindowDTO]?
    let ratingCount: FlexibleDouble?
    let ratingStarCount: FlexibleDouble?
    let tmdbID: FlexibleDouble?
    let trailers: [TrailerDTO]?

    enum CodingKeys: String, CodingKey {
        case id, title, name, genres, directors, actors, countries, languages, aka, overview, durations, trailers
        case originalTitle = "original_title"
        case originalName = "original_name"
        case releaseDate = "release_date"
        case airDate = "air_date"
        case firstAirDate = "first_air_date"
        case imdbID = "imdb_id"
        case posterPath = "poster_path"
        case doubanRating = "douban_rating"
        case doubanLink = "douban_link_google"
        case doubanVerified = "douban_link_verified"
        case releaseWindows = "release_windows"
        case ratingCount = "rating_count"
        case ratingStarCount = "rating_star_count"
        case tmdbID = "tmdb_id"
    }
}

struct ShowDTO: Decodable {
    let id: FlexibleID?
    let name: String?
    let originalName: String?
    let imdbID: String?
    let genres: [NameDTO]?
    let networks: [NameDTO]?
    let directors: [NameDTO]?
    let actors: [NameDTO]?
    let countries: [String]?
    let languages: [String]?
    let aka: [String]?
    let numberOfEpisodes: Int?
    let firstAirDate: String?
    let lastAirDate: String?
    let inProduction: Bool?
    let status: String?
    let episodesInfo: String?
    let posterPath: String?
    let overview: String?
    let ratingCount: FlexibleDouble?
    let ratingStarCount: FlexibleDouble?
    let seasons: [SeasonDTO]?
    let tmdbID: FlexibleDouble?
    let trailers: [TrailerDTO]?

    enum CodingKeys: String, CodingKey {
        case id, name, genres, networks, directors, actors, countries, languages, aka, status, overview, seasons, trailers
        case originalName = "original_name"
        case imdbID = "imdb_id"
        case numberOfEpisodes = "number_of_episodes"
        case firstAirDate = "first_air_date"
        case lastAirDate = "last_air_date"
        case inProduction = "in_production"
        case episodesInfo = "episodes_info"
        case posterPath = "poster_path"
        case ratingCount = "rating_count"
        case ratingStarCount = "rating_star_count"
        case tmdbID = "tmdb_id"
    }
}

struct SeasonDTO: Decodable {
    let name: String?
    let seasonNumber: Int?
    let id: FlexibleID?
    let airDate: String?
    let posterPath: String?
    let doubanRating: FlexibleDouble?
    let doubanLink: String?
    let overview: String?
    let doubanVerified: Bool?

    enum CodingKeys: String, CodingKey {
        case name, id, overview
        case seasonNumber = "season_number"
        case airDate = "air_date"
        case posterPath = "poster_path"
        case doubanRating = "douban_rating"
        case doubanLink = "douban_link_google"
        case doubanVerified = "douban_link_verified"
    }
}

struct FlexibleDouble: Decodable {
    let value: Double?

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            value = nil
        } else if let int = try? container.decode(Int.self) {
            value = Double(int)
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let string = try? container.decode(String.self) {
            value = Double(string.trimmed)
        } else {
            value = nil
        }
    }
}

struct FlexibleID: Decodable {
    let string: String

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let int = try? container.decode(Int.self) {
            string = String(int)
        } else if let text = try? container.decode(String.self) {
            string = text
        } else {
            string = ""
        }
    }
}

enum DateParsing {
    private static let timestampFormatters: [ISO8601DateFormatter] = {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return [withFraction, plain]
    }()

    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone.current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    static func timestamp(_ value: String) -> Date? {
        for formatter in timestampFormatters {
            if let date = formatter.date(from: value) { return date }
        }
        return nil
    }

    static func day(_ value: String) -> Date? {
        dayFormatter.date(from: String(value.prefix(10)))
    }
}

extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
