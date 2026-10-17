import UIKit

/// 豆瓣详情跳转：优先交给豆瓣 App，未安装或打开失败时回落到网页。
///
/// 实测（iPhone 17 / 豆瓣 8.x）：
/// - `douban://douban.com/movie/<id>` 对电影和剧集都能直达条目页；
/// - `douban://douban.com/subject/<id>/` 只会打开 App 首页，因此不再使用。
enum DoubanLink {
    static func candidateURLs(_ subjectID: String) -> [URL] {
        [
            "douban://douban.com/movie/\(subjectID)",
            "douban://douban.com/tv/\(subjectID)"
        ].compactMap(URL.init(string:))
    }

    @MainActor
    static func open(subjectID: String?, webFallback: URL?) {
        guard let subjectID, !subjectID.isEmpty else {
            openWeb(webFallback)
            return
        }
        attempt(candidateURLs(subjectID), index: 0, webFallback: webFallback)
    }

    /// 依次尝试候选路由。`open` 的完成回调会告诉我们系统是否真的把 URL 交给了某个 App，
    /// 这比 `canOpenURL` 更可靠，也不依赖 Info.plist 的 scheme 白名单。
    @MainActor
    private static func attempt(_ urls: [URL], index: Int, webFallback: URL?) {
        guard index < urls.count else {
            openWeb(webFallback)
            return
        }
        UIApplication.shared.open(urls[index], options: [:]) { success in
            guard !success else { return }
            Task { @MainActor in
                attempt(urls, index: index + 1, webFallback: webFallback)
            }
        }
    }

    @MainActor
    private static func openWeb(_ url: URL?) {
        guard let url else { return }
        UIApplication.shared.open(url)
    }
}
