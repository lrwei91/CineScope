import SwiftUI
import UIKit

/// 分享图版式：840pt 宽的小票（ticket）。
/// 尺寸与层级对齐网页端 `share.js`：顶部 480pt 主视觉、打孔虚线、下方实时数据 / 主创 / 简介 / 二维码。
/// 文案不参与 Dynamic Type，分享图是固定像素产物。
struct ShareCardView: View {
    let item: CatalogItem
    let poster: UIImage?
    let siteQR: UIImage?
    let doubanQR: UIImage?

    private let margin: CGFloat = 40
    private let ticketWidth: CGFloat = 760
    private let heroHeight: CGFloat = 480

    var body: some View {
        VStack(spacing: 0) {
            hero
            detailSection
        }
        .frame(width: ticketWidth)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(CineTheme.ink, lineWidth: 2)
        }
        .overlay(alignment: .top) {
            Perforation()
                .offset(y: heroHeight)
        }
        .padding(margin)
        .background {
            ZStack {
                Color.white
                ShareGrid()
            }
        }
    }

    // MARK: - 主视觉

    private var hero: some View {
        HStack(alignment: .top, spacing: 0) {
            if let poster {
                Image(uiImage: poster)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 240, height: 426)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .padding(.leading, 40)
                    .padding(.top, 27)
            }

            VStack(alignment: .leading, spacing: 0) {
                Text(item.title)
                    .font(.system(size: 46, weight: .heavy))
                    .tracking(-1.4)
                    .foregroundStyle(CineTheme.ink)
                    .lineLimit(3)
                    .lineSpacing(6)
                    .fixedSize(horizontal: false, vertical: true)

                if !item.subtitle.isEmpty {
                    Text(item.subtitle)
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(CineTheme.inkMuted)
                        .lineLimit(2)
                        .lineSpacing(4)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 10)
                } else {
                    Color.clear.frame(height: 20)
                }

                VStack(alignment: .leading, spacing: 14) {
                    metaRow("豆瓣评分", ratingText)
                    metaRow("上映时间", item.date.isEmpty ? "UNKNOWN" : item.date)
                    if !typeText.isEmpty {
                        metaRow("作品分类", typeText)
                    }
                }
                .padding(.top, 20)
            }
            .frame(width: poster == nil ? 680 : 404, alignment: .leading)
            .padding(.leading, poster == nil ? 40 : 36)
            .padding(.top, poster == nil ? 60 : 95)

            Spacer(minLength: 0)
        }
        .frame(height: heroHeight, alignment: .top)
        .background(CineTheme.accentSoft)
    }

    private func metaRow(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            Text(label)
                .font(.system(size: 20, weight: .medium))
                .foregroundStyle(CineTheme.inkMuted)
                .frame(width: 100, alignment: .leading)
            Text(value)
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(CineTheme.ink)
                .lineLimit(2)
            Spacer(minLength: 0)
        }
    }

    // MARK: - 下半部分

    private var detailSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let metric = realtimeMetric {
                metricCard(metric)
                    .padding(.top, 40)
            }

            if !crewLines.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(crewLines, id: \.self) { line in
                        Text(line)
                            .font(.system(size: 22, weight: .medium))
                            .foregroundStyle(CineTheme.ink)
                            .lineSpacing(6)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.top, realtimeMetric == nil ? 40 : 34)
            }

            if !item.overview.isEmpty {
                Text(item.overview)
                    .font(.system(size: 22))
                    .foregroundStyle(CineTheme.inkMuted)
                    .lineSpacing(12)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, crewLines.isEmpty && realtimeMetric == nil ? 40 : 24)
            }

            bottomSection
                .padding(.top, 56)
        }
        .padding(.horizontal, 40)
        .padding(.bottom, 40)
    }

    private func metricCard(_ metric: ShareMetric) -> some View {
        HStack(alignment: .bottom, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(metric.label)
                    .font(.system(size: 18, weight: .heavy))
                    .foregroundStyle(CineTheme.ink)
                Text(metric.value)
                    .font(.system(size: 30, weight: .heavy))
                    .foregroundStyle(CineTheme.ink)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            if !metric.detail.isEmpty {
                Text(metric.detail)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(CineTheme.inkMuted)
                    .lineLimit(2)
                    .multilineTextAlignment(.trailing)
            }
        }
        .padding(.horizontal, 22)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, minHeight: 88, alignment: .leading)
        .background(CineTheme.accentSoft, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(CineTheme.ink, lineWidth: 1.5)
        }
    }

    private var bottomSection: some View {
        HStack(alignment: .bottom, spacing: 24) {
            qrCard(title: "最新片单", image: siteQR)
            if doubanQR != nil {
                qrCard(title: "豆瓣详情", image: doubanQR)
            }
            Spacer(minLength: 12)
            VStack(alignment: .trailing, spacing: 3) {
                Text("CineScope")
                    .font(.system(size: 24, weight: .heavy))
                    .foregroundStyle(CineTheme.ink)
                Text(RemoteConfig.siteURL.host ?? "")
                    .font(.system(size: 13, weight: .medium, design: .monospaced))
                    .foregroundStyle(CineTheme.inkMuted)
            }
        }
    }

    private func qrCard(title: String, image: UIImage?) -> some View {
        VStack(spacing: 0) {
            Text(title)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(CineTheme.ink)
                .frame(maxWidth: .infinity, minHeight: 28)
                .background(CineTheme.accent, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .padding(.horizontal, 10)
                .padding(.top, 10)

            Group {
                if let image {
                    Image(uiImage: image)
                        .interpolation(.none)
                        .resizable()
                        .frame(width: 132, height: 132)
                        .overlay {
                            Rectangle().strokeBorder(CineTheme.ink, lineWidth: 1)
                        }
                } else {
                    Rectangle()
                        .fill(Color.white)
                        .frame(width: 132, height: 132)
                        .overlay { Rectangle().strokeBorder(CineTheme.ink, lineWidth: 1) }
                }
            }
            .padding(.top, 8)

            Spacer(minLength: 0)
        }
        .frame(width: 164, height: 198)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(CineTheme.ink, lineWidth: 1)
        }
    }

    // MARK: - 数据整理

    private var ratingText: String {
        guard let rating = item.verifiedRating else { return "暂无" }
        return String(format: "%.1f", rating)
    }

    private var typeText: String {
        item.genres
            .map(Genres.display)
            .filter { $0 != "剧情" && $0 != "动画" }
            .prefix(4)
            .joined(separator: " / ")
    }

    private var crewLines: [String] {
        var lines: [String] = []
        if !item.directors.isEmpty {
            lines.append("导演：" + item.directors.joined(separator: " / "))
        }
        if !item.actors.isEmpty {
            lines.append("主演：" + item.actors.prefix(8).joined(separator: " / "))
        }
        return lines
    }

    private var realtimeMetric: ShareMetric? {
        if item.kind == .movie, let boxOffice = item.boxOffice {
            let detail = [
                boxOffice.boxOfficeRate.isEmpty ? "" : "占比 \(boxOffice.boxOfficeRate)",
                boxOffice.showCountRate.isEmpty ? "" : "排片 \(boxOffice.showCountRate)"
            ].filter { !$0.isEmpty }.joined(separator: " · ")
            return ShareMetric(
                label: "票房 \(boxOffice.rank.map { "#\($0)" } ?? "实时")",
                value: boxOffice.headline,
                detail: detail
            )
        }
        if item.kind == .tv, let heat = item.tvHeat {
            let detail = [heat.platformDesc, heat.releaseInfo].filter { !$0.isEmpty }.joined(separator: " · ")
            return ShareMetric(
                label: "热度 \(heat.rank.map { "#\($0)" } ?? "实时")",
                value: heat.headline,
                detail: detail
            )
        }
        return nil
    }
}

struct ShareMetric {
    let label: String
    let value: String
    let detail: String
}

/// 上下两段之间的打孔线与半圆缺口；白圆同时擦掉边框和底纹。
private struct Perforation: View {
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .topLeading) {
                Path { path in
                    path.move(to: CGPoint(x: 34, y: 0.5))
                    path.addLine(to: CGPoint(x: geo.size.width - 34, y: 0.5))
                }
                .stroke(CineTheme.ink, style: StrokeStyle(lineWidth: 2, dash: [8, 12]))

                Circle()
                    .fill(Color.white)
                    .frame(width: 48, height: 48)
                    .position(x: 0, y: 0.5)

                Circle()
                    .fill(Color.white)
                    .frame(width: 48, height: 48)
                    .position(x: geo.size.width, y: 0.5)
            }
        }
        .frame(height: 1)
    }
}

/// 与网页分享画布一致的 32pt 底纹。
private struct ShareGrid: View {
    var body: some View {
        Canvas { context, size in
            var path = Path()
            var x: CGFloat = 0.5
            while x < size.width {
                path.move(to: CGPoint(x: x, y: 0))
                path.addLine(to: CGPoint(x: x, y: size.height))
                x += 32
            }
            var y: CGFloat = 0.5
            while y < size.height {
                path.move(to: CGPoint(x: 0, y: y))
                path.addLine(to: CGPoint(x: size.width, y: y))
                y += 32
            }
            context.stroke(path, with: .color(CineTheme.ink.opacity(0.055)), lineWidth: 1)
        }
        .allowsHitTesting(false)
    }
}
