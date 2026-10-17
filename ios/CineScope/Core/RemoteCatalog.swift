import Foundation

enum RemoteConfig {
    /// 片单 JSON 与海报都由同一个静态站点提供。
    static let baseURL = URL(string: "https://movie.lrwei91.cn/")!
    static let siteURL = URL(string: "https://movie.lrwei91.cn/")!

    static func url(for path: String) -> URL {
        baseURL.appendingPathComponent(path)
    }

    /// 海报既可能是站内相对路径，也可能是上游给的绝对地址。
    static func posterURL(_ path: String?) -> URL? {
        guard let path, !path.trimmed.isEmpty else { return nil }
        if path.lowercased().hasPrefix("http") { return URL(string: path) }
        return url(for: path)
    }
}

struct LoadedCatalog {
    let items: [CatalogItem]
    let updatedAt: Date?
    /// true 表示网络不可用时回退到本地副本。
    let stale: Bool
}

struct LoadedStatuses {
    let statuses: [String: DoubanStatusRecord]
    let updatedAt: Date?
}

/// JSON 拉取与本地副本。海报走系统 URLSession 缓存，这里只管数据文件。
actor CatalogService {
    static let shared = CatalogService()

    private let session: URLSession
    private let cacheDirectory: URL
    private let fileManager = FileManager.default

    init() {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 20
        configuration.timeoutIntervalForResource = 40
        configuration.requestCachePolicy = .useProtocolCachePolicy
        session = URLSession(configuration: configuration)

        let caches = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
        cacheDirectory = caches.appendingPathComponent("CineScopePayloads", isDirectory: true)
        try? fileManager.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }

    func load(category: CategoryDefinition) async throws -> LoadedCatalog {
        let (data, stale) = try await fetch(path: category.completePath)
        let normalized = try CatalogNormalizer.normalize(data: data, category: category)

        var items = normalized.items
        if let path = category.boxOfficePath {
            items = await mergeBoxOffice(into: items, path: path)
        }
        if let path = category.tvHeatPath {
            items = await mergeTVHeat(into: items, path: path)
        }

        return LoadedCatalog(items: items, updatedAt: normalized.updatedAt, stale: stale)
    }

    func loadStatuses() async throws -> LoadedStatuses {
        let (data, _) = try await fetch(path: "json/douban_statuses.json")
        let payload = try JSONDecoder().decode(StatusPayloadDTO.self, from: data)
        return LoadedStatuses(
            statuses: payload.statuses ?? [:],
            updatedAt: payload.metadata?.lastUpdated.flatMap(DateParsing.timestamp)
        )
    }

    // MARK: - 网络

    private func fetch(path: String) async throws -> (Data, Bool) {
        var request = URLRequest(url: RemoteConfig.url(for: path))
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.cachePolicy = .reloadIgnoringLocalCacheData

        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                throw CatalogError.network("服务端响应异常")
            }
            if (200..<300).contains(http.statusCode) {
                writeCache(data, for: path)
                return (data, false)
            }
            // 4xx 是请求本身的问题，不回退旧数据；5xx 视为上游故障，允许用缓存顶一下。
            if http.statusCode >= 500, let cached = readCache(path) {
                return (cached, true)
            }
            throw CatalogError.network("服务端返回 \(http.statusCode)")
        } catch let error as CatalogError {
            throw error
        } catch {
            if let cached = readCache(path) {
                return (cached, true)
            }
            throw CatalogError.network("网络不可用：\(error.localizedDescription)")
        }
    }

    private func cacheURL(for path: String) -> URL {
        let name = path.replacingOccurrences(of: "/", with: "_")
        return cacheDirectory.appendingPathComponent(name)
    }

    private func readCache(_ path: String) -> Data? {
        try? Data(contentsOf: cacheURL(for: path))
    }

    private func writeCache(_ data: Data, for path: String) {
        try? data.write(to: cacheURL(for: path), options: .atomic)
    }

    // MARK: - 猫眼实时数据

    private func mergeBoxOffice(into items: [CatalogItem], path: String) async -> [CatalogItem] {
        guard let (data, _) = try? await fetch(path: path),
              let payload = try? JSONDecoder().decode(BoxOfficePayloadDTO.self, from: data),
              let movies = payload.movies else { return items }

        var byTitle: [String: BoxOffice] = [:]
        for movie in movies {
            guard let name = movie.movieName?.trimmed.nilIfEmpty else { continue }
            let key = CatalogNormalizer.normalizeText(name)
            guard byTitle[key] == nil else { continue }
            byTitle[key] = BoxOffice(
                rank: movie.rank?.value.flatMap { Int($0) },
                realTimeBoxOffice: movie.realTimeBoxOffice?.trimmed ?? "",
                cumulativeBoxOffice: movie.cumulativeBoxOffice?.trimmed ?? "",
                boxOfficeRate: movie.boxOfficeRate?.trimmed ?? "",
                showCountRate: movie.showCountRate?.trimmed ?? ""
            )
        }

        return items.map { item in
            guard item.kind == .movie else { return item }
            let keys = ([item.title, item.subtitle] + item.aka).map(CatalogNormalizer.normalizeText)
            guard let match = keys.compactMap({ byTitle[$0] }).first else { return item }
            return item.copy(boxOffice: match)
        }
    }

    private func mergeTVHeat(into items: [CatalogItem], path: String) async -> [CatalogItem] {
        guard let (data, _) = try? await fetch(path: path),
              let payload = try? JSONDecoder().decode(TVHeatPayloadDTO.self, from: data),
              let series = payload.series else { return items }

        var byTitle: [String: TVHeat] = [:]
        for show in series {
            guard let name = show.seriesName?.trimmed.nilIfEmpty else { continue }
            let key = CatalogNormalizer.normalizeText(name)
            guard byTitle[key] == nil else { continue }
            byTitle[key] = TVHeat(
                rank: show.rank?.value.flatMap { Int($0) },
                currHeat: show.currHeat?.trimmed ?? "",
                currHeatDesc: show.currHeatDesc?.trimmed ?? "",
                platformDesc: show.platformDesc?.trimmed ?? "",
                releaseInfo: show.releaseInfo?.trimmed ?? ""
            )
        }

        return items.map { item in
            guard item.kind == .tv else { return item }
            let keys = ([item.title, item.subtitle] + item.aka).map(CatalogNormalizer.normalizeText)
            guard let match = keys.compactMap({ byTitle[$0] }).first else { return item }
            return item.copy(tvHeat: match)
        }
    }
}

// MARK: - 猫眼原始结构

private struct StatusPayloadDTO: Decodable {
    let metadata: MetadataDTO?
    let statuses: [String: DoubanStatusRecord]?

    struct MetadataDTO: Decodable {
        let lastUpdated: String?

        enum CodingKeys: String, CodingKey {
            case lastUpdated = "last_updated"
        }
    }
}

private struct BoxOfficePayloadDTO: Decodable {
    let movies: [Row]?

    struct Row: Decodable {
        let rank: FlexibleDouble?
        let movieName: String?
        let realTimeBoxOffice: String?
        let cumulativeBoxOffice: String?
        let boxOfficeRate: String?
        let showCountRate: String?

        enum CodingKeys: String, CodingKey {
            case rank
            case movieName = "movie_name"
            case realTimeBoxOffice = "real_time_box_office"
            case cumulativeBoxOffice = "cumulative_box_office"
            case boxOfficeRate = "box_office_rate"
            case showCountRate = "show_count_rate"
        }
    }
}

private struct TVHeatPayloadDTO: Decodable {
    let series: [Row]?

    struct Row: Decodable {
        let rank: FlexibleDouble?
        let seriesName: String?
        let currHeat: String?
        let currHeatDesc: String?
        let platformDesc: String?
        let releaseInfo: String?

        enum CodingKeys: String, CodingKey {
            case rank
            case seriesName = "series_name"
            case currHeat = "curr_heat"
            case currHeatDesc = "curr_heat_desc"
            case platformDesc = "platform_desc"
            case releaseInfo = "release_info"
        }
    }
}
