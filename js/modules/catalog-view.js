// 仅比较可见数据；后台补全未改变卡片时保留 DOM、焦点和滚动位置。
export function sameCatalogItems(previous, next) {
    return previous.length === next.length && previous.every((item, index) =>
        item === next[index] || JSON.stringify(item) === JSON.stringify(next[index])
    );
}
