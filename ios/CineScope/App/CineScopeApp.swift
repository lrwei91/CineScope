import SwiftUI

@main
@MainActor
struct CineScopeApp: App {
    init() {
        // 海报是整屏最大的网络成本。默认 URLCache 只有几百 KB，
        // 来回滚动会把同一张图反复下载，这里放大到可缓存整屏与相邻月份。
        URLCache.shared = URLCache(
            memoryCapacity: 64 * 1024 * 1024,
            diskCapacity: 512 * 1024 * 1024
        )
    }

    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}
