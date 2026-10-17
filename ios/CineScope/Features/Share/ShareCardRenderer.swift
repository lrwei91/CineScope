import CoreImage
import CoreImage.CIFilterBuiltins
import SwiftUI
import UIKit

/// 分享图生成：拉海报、生成两张二维码，再用 ImageRenderer 输出位图。
@MainActor
enum ShareCardRenderer {
    static func render(item: CatalogItem) async -> UIImage? {
        let poster = await loadPoster(item.posterPath)
        let siteQR = qrImage(for: RemoteConfig.siteURL.absoluteString)
        let doubanQR = item.doubanLink.flatMap { qrImage(for: $0) }

        let content = ShareCardView(
            item: item,
            poster: poster,
            siteQR: siteQR,
            doubanQR: doubanQR
        )
        let renderer = ImageRenderer(content: content)
        renderer.scale = 2
        renderer.isOpaque = true
        renderer.proposedSize = ProposedViewSize(width: 840, height: nil)
        return renderer.uiImage
    }

    /// 写入临时目录，交给系统分享面板按文件发送。
    static func writeJPEG(_ image: UIImage, item: CatalogItem) -> URL? {
        guard let data = image.jpegData(compressionQuality: 0.92) else { return nil }
        let safeID = item.rawID.replacingOccurrences(
            of: "[^0-9A-Za-z_-]",
            with: "_",
            options: .regularExpression
        )
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("CineScope-\(safeID)-\(Int(Date().timeIntervalSince1970)).jpg")
        do {
            try data.write(to: url, options: .atomic)
            return url
        } catch {
            return nil
        }
    }

    private static func loadPoster(_ path: String?) async -> UIImage? {
        guard let url = RemoteConfig.posterURL(path) else { return nil }
        var request = URLRequest(url: url)
        request.timeoutInterval = 12
        guard let (data, _) = try? await URLSession.shared.data(for: request) else { return nil }
        return UIImage(data: data)
    }

    /// 本地生成二维码，不依赖网页端用的 api.qrserver.com。
    static func qrImage(for value: String) -> UIImage? {
        guard !value.isEmpty else { return nil }
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(value.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }

        // 二维码默认透明底，这里先压一层白底，避免分享图在深色背景下出现透明块。
        let white = CIImage(color: .white).cropped(to: output.extent)
        let composed = output.composited(over: white)
        let scaled = composed.transformed(by: CGAffineTransform(scaleX: 10, y: 10))

        let context = CIContext()
        guard let cgImage = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}
