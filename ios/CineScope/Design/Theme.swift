import SwiftUI
import UIKit

enum Haptics {
    static func tap() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    static func warning() {
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
    }
}

/// 动画入口：系统开启「减弱动效」后统一退化为瞬时切换。
enum CineMotion {
    static var isReduced: Bool { UIAccessibility.isReduceMotionEnabled }

    static var smooth: Animation? {
        isReduced ? nil : .smooth(duration: 0.26)
    }

    static var press: Animation? {
        isReduced ? nil : .spring(response: 0.24, dampingFraction: 0.86)
    }
}

/// 视觉令牌来自网页端 `style.css` 的 `:root`：白纸、黑墨、荧光黄。
/// 片单固定浅色，不跟随系统深色模式。
enum CineTheme {
    static let paper = Color(hex: 0xFFFFFF)
    static let paperWarm = Color(hex: 0xFFFDF7)
    static let ink = Color(hex: 0x1A1A1A)
    static let inkMuted = Color(hex: 0x626262)
    static let accent = Color(hex: 0xFFE28A)
    static let accentSoft = Color(hex: 0xFFF4C8)
    static let line = Color(hex: 0xDEDCD4)
    static let controlLine = Color(hex: 0x85857E)
    static let ticket = Color(hex: 0xEEE4D4)
    static let progress = Color(hex: 0xFF4D00)
    static let danger = Color(hex: 0xA23A35)

    static let cardRadius: CGFloat = 20
    static let mediaRadius: CGFloat = 15
    static let controlRadius: CGFloat = 10

    static func body(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: scaled(size), weight: weight)
    }

    static func heading(_ size: CGFloat, weight: Font.Weight = .bold) -> Font {
        .system(size: scaled(size), weight: weight)
    }

    static func mono(_ size: CGFloat, weight: Font.Weight = .medium) -> Font {
        .system(size: scaled(size), weight: weight, design: .monospaced)
    }

    /// 导航类元素（底栏、标签）字号固定，避免放大字号撑坏固定高度。
    static func fixed(_ size: CGFloat, weight: Font.Weight = .medium) -> Font {
        .system(size: size, weight: weight)
    }

    private static func scaled(_ size: CGFloat) -> CGFloat {
        UIFontMetrics(forTextStyle: .body).scaledValue(for: size)
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }
}

/// 静态纸面：32pt 网格与右上角黄色光晕，与网页端 body 背景一致。
struct PaperBackground: View {
    var gridSpacing: CGFloat = 32

    var body: some View {
        ZStack {
            CineTheme.paper
            RadialGradient(
                colors: [CineTheme.accent.opacity(0.22), .clear],
                center: UnitPoint(x: 0.86, y: 0.02),
                startRadius: 4,
                endRadius: 300
            )
            Canvas { context, size in
                var path = Path()
                var x: CGFloat = 0
                while x <= size.width {
                    path.move(to: CGPoint(x: x, y: 0))
                    path.addLine(to: CGPoint(x: x, y: size.height))
                    x += gridSpacing
                }
                var y: CGFloat = 0
                while y <= size.height {
                    path.move(to: CGPoint(x: 0, y: y))
                    path.addLine(to: CGPoint(x: size.width, y: y))
                    y += gridSpacing
                }
                context.stroke(path, with: .color(CineTheme.ink.opacity(0.018)), lineWidth: 0.5)
            }
            .allowsHitTesting(false)
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}

/// 品牌标记：白色圆底 + C 形环 + 黄色片盘，和 App 图标同源。
struct CineMark: View {
    var size: CGFloat = 34

    var body: some View {
        ZStack {
            Path { path in
                path.addArc(
                    center: CGPoint(x: size / 2, y: size / 2),
                    radius: size * 0.36,
                    startAngle: .degrees(60),
                    endAngle: .degrees(300),
                    clockwise: false
                )
            }
            .stroke(CineTheme.ink, style: StrokeStyle(lineWidth: size * 0.085, lineCap: .round))

            Circle()
                .fill(CineTheme.accent)
                .overlay(Circle().strokeBorder(CineTheme.ink, lineWidth: size * 0.035))
                .frame(width: size * 0.44, height: size * 0.44)

            Image(systemName: "play.fill")
                .font(.system(size: size * 0.17, weight: .black))
                .foregroundStyle(CineTheme.ink)
                .offset(x: size * 0.012)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// 高亮划线：品牌里反复出现的荧光黄记号。
struct MarkerUnderline: View {
    var height: CGFloat = 8

    var body: some View {
        Rectangle()
            .fill(CineTheme.accent)
            .frame(height: height)
            .offset(y: height * 0.45)
    }
}

/// iOS 26 用液态玻璃，低版本回退到超薄材质；减少透明度时改用实色纸面。
struct GlassSurface: ViewModifier {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast
    var cornerRadius: CGFloat = 999

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        Group {
            if reduceTransparency || contrast == .increased {
                content.background(CineTheme.paper, in: shape)
            } else if #available(iOS 26.0, *) {
                // 海报底色很杂，纯玻璃会让文字失去对比度；
                // 先垫一层薄纸再上玻璃，保持磨砂纸感的可读性。
                content
                    .background(CineTheme.paper.opacity(0.66), in: shape)
                    .glassEffect(.regular.interactive(), in: shape)
            } else {
                content
                    .background(CineTheme.paper.opacity(0.55), in: shape)
                    .background(.regularMaterial, in: shape)
            }
        }
        .overlay {
            shape.strokeBorder(CineTheme.line, lineWidth: 0.75)
        }
        .shadow(color: CineTheme.ink.opacity(0.08), radius: 16, x: 0, y: 5)
    }
}

struct PressableStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var scale: CGFloat = 0.96

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? scale : 1)
            .opacity(configuration.isPressed ? 0.88 : 1)
            .animation(reduceMotion ? nil : CineMotion.press, value: configuration.isPressed)
    }
}

/// 卡片按压：轻微收缩和墨色淡化，不改变网格尺寸。
struct CardPressStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.985 : 1)
            .opacity(configuration.isPressed ? 0.84 : 1)
            .animation(reduceMotion ? nil : CineMotion.press, value: configuration.isPressed)
    }
}
