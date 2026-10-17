import SwiftUI

struct CategorySheet: View {
    let store: CatalogStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 8) {
                    HStack(spacing: 10) {
                        CineMark(size: 40)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("鲤鱼 · 环球片单")
                                .font(CineTheme.heading(20, weight: .heavy))
                            Text("下一部想看的，从这里开始。")
                                .font(CineTheme.body(12))
                                .foregroundStyle(CineTheme.inkMuted)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.bottom, 16)
                    ForEach(Categories.all) { category in
                        Button {
                            Haptics.tap()
                            dismiss()
                            Task { await store.select(category: category.id) }
                        } label: {
                            row(category)
                        }
                        .buttonStyle(PressableStyle(scale: 0.99))
                    }

                    Text(store.isCurrentStale
                         ? "离线数据 · 正在使用上次保存的片单"
                         : "片单更新于 \(DateText.timestamp(store.lastUpdated))")
                        .font(CineTheme.mono(9.5))
                        .foregroundStyle(CineTheme.inkMuted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 10)
                }
                .padding(16)
            }
            .background(PaperBackground())
            .navigationTitle("片单分类")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("完成") { dismiss() }
                        .font(CineTheme.fixed(14, weight: .semibold))
                }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .task {
            for category in Categories.all where store.itemsByCategory[category.id] == nil {
                await store.load(category: category.id)
            }
        }
    }

    private func row(_ category: CategoryDefinition) -> some View {
        let isSelected = store.selectedCategory == category.id
        let count = store.itemsByCategory[category.id]?.count

        return HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(category.label)
                    .font(CineTheme.heading(15, weight: .semibold))
                    .foregroundStyle(CineTheme.ink)
                Text(category.kind == .tv ? "剧集 · 按季上映日期" : "电影 · 按上映日期")
                    .font(CineTheme.body(11))
                    .foregroundStyle(CineTheme.inkMuted)
            }
            Spacer(minLength: 6)
            Text(count.map { "\($0) 部" } ?? "—")
                .font(CineTheme.mono(10.5))
                .foregroundStyle(CineTheme.inkMuted)
            Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(isSelected ? CineTheme.ink : CineTheme.line)
        }
        .padding(.horizontal, 13)
        .frame(minHeight: 68)
        .background(isSelected ? CineTheme.accentSoft : CineTheme.paper,
                    in: RoundedRectangle(cornerRadius: CineTheme.controlRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: CineTheme.controlRadius, style: .continuous)
                .strokeBorder(isSelected ? CineTheme.ink : CineTheme.controlLine, lineWidth: 1)
        }
        .contentShape(Rectangle())
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

/// 即时筛选，结果数量与重置放在稳定的底部操作区。
struct DiscoverFilterSheet: View {
    let store: CatalogStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("评分").font(CineTheme.heading(17, weight: .bold))
                        FlowRow(spacing: 8) {
                            ForEach(store.ratingChoices) { choice in
                                FilterChip(title: choice.label, isActive: store.rating == choice.selection, showsCheck: true) {
                                    Haptics.tap()
                                    store.setRating(choice.selection)
                                }
                            }
                        }
                    }
                    VStack(alignment: .leading, spacing: 12) {
                        Text("类型 · 可多选").font(CineTheme.heading(17, weight: .bold))
                        FlowRow(spacing: 8) {
                            FilterChip(title: "全部类型", isActive: store.selectedGenres.isEmpty, showsCheck: true) {
                                Haptics.tap()
                                store.toggleGenre("全部")
                            }
                            ForEach(store.availableGenres, id: \.self) { genre in
                                FilterChip(title: Genres.display(genre), isActive: store.selectedGenres.contains(genre), showsCheck: true) {
                                    Haptics.tap()
                                    store.toggleGenre(genre)
                                }
                            }
                        }
                    }
                }
                .foregroundStyle(CineTheme.ink)
                .padding(20)
            }
            .background(PaperBackground())
            .navigationTitle("筛选片单")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("关闭") { dismiss() }
                }
            }
            .safeAreaInset(edge: .bottom) {
                HStack(spacing: 12) {
                    Button("重置") {
                        Haptics.tap()
                        store.rating = .all
                        store.selectedGenres = []
                    }
                    .font(CineTheme.body(14, weight: .semibold))
                    .frame(minWidth: 64, minHeight: 48)
                    .buttonStyle(PressableStyle())
                    Button {
                        Haptics.tap()
                        dismiss()
                    } label: {
                        Text("查看 \(store.filteredItems.count) 部作品")
                            .font(CineTheme.body(14, weight: .semibold))
                            .foregroundStyle(CineTheme.paper)
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .background(CineTheme.ink, in: Capsule())
                    }
                    .buttonStyle(PressableStyle())
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
                .background(CineTheme.paper)
            }
        }
        .tint(CineTheme.ink)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }
}
