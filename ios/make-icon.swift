import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

// 生成 iOS AppIcon（1024×1024，无 alpha 通道）。
// 图形沿用 assets/icons/app-icon.svg：白底 + 黑墨 C 形电影环 + 荧光黄片盘与播放键。
// 只画矢量几何，不预烘焙圆角、阴影或留白，外框交给系统裁切。
//
// 这里直接用 CoreGraphics 位图上下文，不经过 NSGraphicsContext：
// 受限执行环境里 sandbox-exec 不可用，AppKit 的绘图上下文会创建失败。

let side = 1024
let unit = CGFloat(side) / 64

func color(_ hex: UInt32) -> CGColor {
    CGColor(srgbRed: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1)
}

let paper = color(0xFFFFFF)
let ink = color(0x1A1A1A)
let accent = color(0xFFE28A)

func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
    // SVG 的 y 轴向下，CoreGraphics 向上，需要翻转。
    CGPoint(x: x * unit, y: (64 - y) * unit)
}

guard let space = CGColorSpace(name: CGColorSpace.sRGB),
      let ctx = CGContext(data: nil,
                          width: side,
                          height: side,
                          bitsPerComponent: 8,
                          bytesPerRow: 0,
                          space: space,
                          bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else {
    FileHandle.standardError.write(Data("无法创建位图上下文\n".utf8))
    exit(1)
}

ctx.setShouldAntialias(true)
ctx.setFillColor(paper)
ctx.fill(CGRect(x: 0, y: 0, width: side, height: side))

// C 形胶片环：右侧留出 120° 开口，线端圆头。
ctx.setStrokeColor(ink)
ctx.setLineWidth(3.87 * unit)
ctx.setLineCap(.round)
ctx.addArc(center: point(32, 32),
           radius: 15.48 * unit,
           startAngle: 60 * .pi / 180,
           endAngle: 300 * .pi / 180,
           clockwise: false)
ctx.strokePath()

// 中央片盘
let discRect = CGRect(x: (32 - 9.89) * unit,
                      y: (64 - 32 - 9.89) * unit,
                      width: 9.89 * 2 * unit,
                      height: 9.89 * 2 * unit)
ctx.setFillColor(accent)
ctx.fillEllipse(in: discRect)
ctx.setStrokeColor(ink)
ctx.setLineWidth(1.29 * unit)
ctx.strokeEllipse(in: discRect)

// 播放三角
ctx.beginPath()
ctx.move(to: point(29.764, 25.636))
ctx.addLine(to: point(39.320, 32.000))
ctx.addLine(to: point(29.764, 38.364))
ctx.closePath()
ctx.setFillColor(ink)
ctx.fillPath()

// 右上角胶片孔
let dotRect = CGRect(x: (44.47 - 2.236) * unit,
                     y: (64 - 20.218 - 2.236) * unit,
                     width: 2.236 * 2 * unit,
                     height: 2.236 * 2 * unit)
ctx.setFillColor(accent)
ctx.fillEllipse(in: dotRect)
ctx.setStrokeColor(ink)
ctx.setLineWidth(0.86 * unit)
ctx.strokeEllipse(in: dotRect)

guard let image = ctx.makeImage() else {
    FileHandle.standardError.write(Data("位图转 CGImage 失败\n".utf8))
    exit(1)
}

let output = URL(fileURLWithPath: CommandLine.arguments.count > 1
                 ? CommandLine.arguments[1]
                 : "AppIcon.png")
guard let destination = CGImageDestinationCreateWithURL(output as CFURL,
                                                        UTType.png.identifier as CFString,
                                                        1,
                                                        nil) else {
    FileHandle.standardError.write(Data("无法创建 PNG 输出\n".utf8))
    exit(1)
}
CGImageDestinationAddImage(destination, image, nil)
guard CGImageDestinationFinalize(destination) else {
    FileHandle.standardError.write(Data("PNG 编码失败\n".utf8))
    exit(1)
}
print("已生成 \(output.path)（\(side)×\(side)）")
