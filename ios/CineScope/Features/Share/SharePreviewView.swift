import SwiftUI
import UIKit

struct SharePayload: Identifiable {
    let id = UUID()
    let image: UIImage
    let fileURL: URL
    let title: String
}

/// 分享前先给一张预览图，对齐网页端「先生成、再发送」的流程。
struct SharePreviewView: View {
    let payload: SharePayload

    @Environment(\.dismiss) private var dismiss
    @State private var showsActivity = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    Image(uiImage: payload.image)
                        .resizable()
                        .scaledToFit()
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .strokeBorder(CineTheme.line, lineWidth: 1)
                        }
                        .shadow(color: CineTheme.ink.opacity(0.14), radius: 18, x: 0, y: 8)

                    Text("点按右上角分享到微信、相册或其他 App；分享面板里的「存储图像」可直接存到相册。")
                        .font(CineTheme.body(11.5))
                        .foregroundStyle(CineTheme.inkMuted)
                        .multilineTextAlignment(.center)
                }
                .padding(16)
            }
            .background(PaperBackground())
            .navigationTitle(payload.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("关闭") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showsActivity = true
                    } label: {
                        Image(systemName: "square.and.arrow.up")
                    }
                    .accessibilityLabel("分享图片")
                }
            }
        }
        .presentationDetents([.large])
        .sheet(isPresented: $showsActivity) {
            ActivityView(items: [payload.fileURL])
        }
    }
}

struct ActivityView: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
