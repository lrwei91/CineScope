import SwiftUI

/// 筛选胶囊：选中为墨底纸字，未选中为纸底细边。
struct FilterChip: View {
    let title: String
    var isActive: Bool = false
    var showsCheck: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                if isActive && showsCheck {
                    Image(systemName: "checkmark")
                        .font(.system(size: 9, weight: .bold))
                }
                Text(title)
                    .font(CineTheme.body(12.5, weight: isActive ? .semibold : .medium))
            }
            .foregroundStyle(isActive ? CineTheme.paper : CineTheme.inkMuted)
            .padding(.horizontal, 13)
            .frame(minHeight: 44)
            .background(isActive ? CineTheme.ink : CineTheme.paper, in: Capsule())
            .overlay {
                Capsule().strokeBorder(isActive ? CineTheme.ink : CineTheme.controlLine, lineWidth: 0.75)
            }
            .contentShape(Capsule())
        }
        .buttonStyle(PressableStyle(scale: 0.97))
        .animation(CineMotion.smooth, value: isActive)
        .accessibilityAddTraits(isActive ? .isSelected : [])
    }
}

/// 卡片与详情里的小标签。
struct TagPill: View {
    let text: String
    var highlighted: Bool = false

    var body: some View {
        Text(text)
            .font(CineTheme.body(11, weight: .medium))
            .foregroundStyle(highlighted ? CineTheme.ink : CineTheme.inkMuted)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(highlighted ? CineTheme.accentSoft : CineTheme.paper, in: Capsule())
            .overlay {
                Capsule().strokeBorder(highlighted ? CineTheme.accent : CineTheme.line, lineWidth: 1)
            }
    }
}

struct DoubanStatusBadge: View {
    let status: DoubanStatus

    private var background: Color {
        switch status {
        case .watched: return CineTheme.ink
        case .watching: return CineTheme.accent
        case .wishlist: return CineTheme.paper
        }
    }

    private var foreground: Color {
        switch status {
        case .watched: return CineTheme.paper
        case .watching, .wishlist: return CineTheme.ink
        }
    }

    var body: some View {
        Text(status.label)
            .font(CineTheme.fixed(9.5, weight: .semibold))
            .foregroundStyle(foreground)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(background, in: RoundedRectangle(cornerRadius: 4, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .strokeBorder(CineTheme.ink.opacity(status == .wishlist ? 0.35 : 0), lineWidth: 1)
            }
    }
}

/// 海报位：固定由调用方给尺寸，图片按填充裁切。
/// Color.clear 先占满可用空间，避免 scaledToFill 按固有尺寸把布局撑开。
struct PosterArt: View {
    let path: String?
    var cornerRadius: CGFloat = CineTheme.mediaRadius
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Color.clear
            .overlay {
                if let url = RemoteConfig.posterURL(path) {
                    AsyncImage(url: url, transaction: Transaction(animation: reduceMotion ? nil : .easeOut(duration: 0.18))) { phase in
                        if case .success(let image) = phase {
                            image.resizable().scaledToFill().transition(.opacity)
                        } else {
                            placeholder
                        }
                    }
                } else {
                    placeholder
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .accessibilityHidden(true)
    }

    private var placeholder: some View {
        ZStack {
            CineTheme.paperWarm
            Image(systemName: "film")
                .font(.system(size: 20, weight: .light))
                .foregroundStyle(CineTheme.ink.opacity(0.22))
        }
    }
}

struct MonthHeader: View {
    let title: String

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            RoundedRectangle(cornerRadius: 2)
                .fill(CineTheme.accent)
                .frame(width: 4, height: 20)
            Text(title)
                .font(CineTheme.heading(19, weight: .heavy))
                .tracking(-0.6)
                .foregroundStyle(CineTheme.ink)
            Rectangle().fill(CineTheme.line).frame(height: 1)
        }
        .padding(.top, 14)
        .accessibilityAddTraits(.isHeader)
    }
}

struct EmptyStateView: View {
    let icon: String
    let title: String
    var message: String?
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 24, weight: .light))
                .foregroundStyle(CineTheme.ink.opacity(0.35))
            Text(title)
                .font(CineTheme.body(14, weight: .medium))
                .foregroundStyle(CineTheme.inkMuted)
                .multilineTextAlignment(.center)
            if let message {
                Text(message)
                    .font(CineTheme.body(12))
                    .foregroundStyle(CineTheme.inkMuted)
                    .multilineTextAlignment(.center)
            }
            if let actionTitle, let action {
                Button(action: action) {
                    Text(actionTitle)
                        .font(CineTheme.fixed(12.5, weight: .semibold))
                        .foregroundStyle(CineTheme.ink)
                        .padding(.horizontal, 14)
                        .frame(minHeight: 44)
                        .background(CineTheme.accent, in: Capsule())
                }
                .buttonStyle(PressableStyle())
                .padding(.top, 2)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 44)
    }
}

/// 骨架屏：与真实卡片同高的静态占位，不做循环动画。
struct SkeletonGrid: View {
    var columns: [GridItem]

    var body: some View {
        LazyVGrid(columns: columns, spacing: 14) {
            ForEach(0..<4, id: \.self) { _ in
                VStack(alignment: .leading, spacing: 10) {
                    RoundedRectangle(cornerRadius: CineTheme.mediaRadius, style: .continuous)
                        .fill(CineTheme.ink.opacity(0.05))
                        .aspectRatio(2.0 / 3.0, contentMode: .fit)
                    RoundedRectangle(cornerRadius: 4)
                        .fill(CineTheme.ink.opacity(0.05))
                        .frame(height: 12)
                    RoundedRectangle(cornerRadius: 4)
                        .fill(CineTheme.ink.opacity(0.04))
                        .frame(width: 76, height: 10)
                }
                .padding(6)
                .background(CineTheme.paper, in: RoundedRectangle(cornerRadius: CineTheme.cardRadius, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: CineTheme.cardRadius, style: .continuous)
                        .strokeBorder(CineTheme.line, lineWidth: 1)
                }
            }
        }
        .accessibilityLabel("正在加载片单")
    }
}

struct InfoRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text(label)
                .font(CineTheme.body(12, weight: .semibold))
                .foregroundStyle(CineTheme.inkMuted)
                .frame(minWidth: 42, alignment: .leading)
            Text(value)
                .font(CineTheme.body(14))
                .foregroundStyle(CineTheme.ink)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
    }
}

/// 稳定的中文时间格式，避免每次渲染新建 DateFormatter。
enum DateText {
    private static let dateTime: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        return formatter
    }()

    private static let dayFormat: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    static func timestamp(_ date: Date?) -> String {
        guard let date else { return "—" }
        return dateTime.string(from: date)
    }

    static func day(_ date: Date) -> String {
        dayFormat.string(from: date)
    }
}
