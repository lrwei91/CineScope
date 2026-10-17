import SwiftUI
import WebKit

/// 预告片播放：Bilibili 播放器是网页组件，这里用 WKWebView 承载，
/// 其余界面仍由 SwiftUI 负责，避免为一段播放器重写整套视频能力。
struct TrailerView: View {
    let trailer: Trailer

    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    private var embedURL: URL? {
        URL(string: trailer.embedURL)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()
                if let embedURL {
                    BilibiliPlayer(url: embedURL)
                        .ignoresSafeArea(edges: .bottom)
                } else {
                    VStack(spacing: 10) {
                        Image(systemName: "play.slash")
                            .font(.system(size: 26, weight: .light))
                        Text("预告片地址不可用")
                            .font(CineTheme.body(14))
                    }
                    .foregroundStyle(.white.opacity(0.7))
                }
            }
            .navigationTitle(trailer.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbarBackground(.black.opacity(0.9), for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("关闭") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        if let url = URL(string: trailer.url), !trailer.url.isEmpty {
                            openURL(url)
                        } else if let embedURL {
                            openURL(embedURL)
                        }
                    } label: {
                        Image(systemName: "safari")
                    }
                    .accessibilityLabel("在 Safari 打开")
                }
            }
        }
    }
}

private struct BilibiliPlayer: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        webView.scrollView.isScrollEnabled = false
        webView.allowsBackForwardNavigationGestures = false

        var request = URLRequest(url: url)
        // Bilibili 播放器按 Referer 判定来源，缺失时会拒绝播放。
        request.setValue("https://www.bilibili.com/", forHTTPHeaderField: "Referer")
        webView.load(request)
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
