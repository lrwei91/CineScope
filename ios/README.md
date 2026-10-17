# CineScope iOS

CineScope（鲤鱼·环球片单）的原生 iOS 客户端。列表、筛选、详情与收藏统计由 SwiftUI 实现，只有预告片播放交给 WebKit，因为它依赖 Bilibili 的网页播放器。

实现约定沿用 [Atlas iOS 实践](../Atlas/docs/ios-app-playbook.md)：原生负责「怎么到达、怎么操作」，Web 只负责必须由网页承载的内容。

## 前置条件

- macOS + Xcode（本机为 27.1，iOS 17 及以上）
- 真机或模拟器运行时；本机当前没有安装 Simulator runtime，命令行只做编译与静态分析
- 免费 Personal Team 即可签名，7 天有效

本机 `xcode-select` 仍指向 Command Line Tools，命令行构建需显式指定开发者目录：

```sh
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
```

## 打开与运行

```sh
open ios/CineScope.xcodeproj
```

首次打开需要：

1. **选择签名团队**：Targets → CineScope → Signing & Capabilities → Team 选自己的 Apple ID。
2. **改 Bundle Identifier**（可选）：默认 `cn.lrwei91.cinescope.ios`。

然后选中真机，⌘R。首次安装需在手机上打开开发者模式（设置 → 隐私与安全性 → 开发者模式），安装后在 设置 → 通用 → VPN 与设备管理 信任开发者证书。

免费签名 7 天过期，到期后在 Xcode 里重新 Run 一次即可，App 数据保留。

### 命令行构建

Swift 宏（`@Observable`、`@State`）需要插件进程，在受限环境里会因 `sandbox-exec` 不可用而失败，命令行构建要加：

```sh
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
xcodebuild -project ios/CineScope.xcodeproj -scheme CineScope \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -configuration Debug -derivedDataPath /tmp/cinescope-dd \
  CODE_SIGNING_ALLOWED=NO OTHER_SWIFT_FLAGS="-disable-sandbox" build
```

真机安装：

```sh
xcodebuild -project ios/CineScope.xcodeproj -scheme CineScope \
  -destination 'id=<UDID>' -destination-timeout 300 -allowProvisioningUpdates \
  -derivedDataPath /tmp/cinescope-dd OTHER_SWIFT_FLAGS="-disable-sandbox" build
```

`-allowProvisioningUpdates` 只有在 **Xcode 已登录 Apple ID** 时才能注册新 App ID 与描述文件。未登录时命令行会报：

```text
error: No Accounts: Add a new account in Accounts settings.
error: No profiles for 'cn.lrwei91.cinescope.ios' were found
```

此时到 Xcode → Settings → Accounts 登录一次，或在 Xcode 里直接 Run 一次；之后命令行也能复用同一份描述文件。

## 架构

```
SwiftUI                        WebKit
┌──────────────────────┐      ┌───────────────────────┐
│ DiscoverView  月度网格 │      │ TrailerView            │
│ DetailView    详情    │ ───▶ │  └ Bilibili 播放器      │
│ CollectionView 我的   │      └───────────────────────┘
│ SearchView    检索    │
└──────────┬───────────┘
           ▼
  CatalogService（URLSession + 本地副本）
           ▼
  https://movie.lrwei91.cn/json/*.json
```

- `Core/Models.swift`：片单条目、预告片、票房/热度、豆瓣状态。
- `Core/CategoryConfig.swift`：7 个分类、评分阈值、类型白名单与优先级。
- `Core/CatalogNormalizer.swift`：剧集按季展开、按豆瓣/TMDB/IMDb 去重合并、字段清洗。
- `Core/CatalogFilter.swift`：评分/类型/关键词筛选、排序与月份分组。
- `Core/RemoteCatalog.swift`：JSON 拉取、磁盘副本、猫眼实时数据合并。
- `Core/CatalogStore.swift`：`@Observable` 状态、分类切换、收藏汇总、深链解析。
- `Features/`：发现、详情、我的、搜索、共享组件。

正文不需要 WebView：详情页是结构化字段，不是 Markdown；把网页渲染器塞进来反而多一层时序与样式耦合。

## 数据链路

与网页端读取同一批 JSON，区别只在加载策略：

| 项目 | 网页端 | iOS |
| --- | --- | --- |
| 首屏 | 先 `latest.json` 再补 `complete.json` | 直接 `complete.json`（一次请求即可完整筛选） |
| 缓存 | 浏览器 HTTP 缓存 | 显式清缓存请求 + `Caches/CineScopePayloads/` 磁盘副本 |
| 断网 | 无回退 | 网络错误或 5xx 回退到最近一次成功副本，页脚标注「离线数据」 |
| 实时数据 | 猫眼票房/热度按标题合并 | 相同，`BoxOffice` / `TVHeat` |
| 收藏 | `douban_statuses.json` 并行拉取 | 相同，失败不阻塞片单 |

4xx 不回退旧数据（请求本身有问题），只有网络层错误与 5xx 才用本地副本——与 Atlas 的处理边界一致。

## 已实现

| 功能 | 状态 |
| --- | --- |
| 7 个分类切换、分类数量与更新日期 | ✅ |
| 评分阈值（按分类）与「近 2 年高分」 | ✅ |
| 类型多选筛选 | ✅ |
| 按月分组的双列海报网格 | ✅ |
| 海报、豆瓣评分、连载中标签、收藏状态徽标 | ✅ |
| 详情区分「更新至 N 集」与「共 N 集」 | ✅ 进度来自 `episodes_info`，总集数来自豆瓣 `episodes_count` |
| 票房 / 网播热度 | ✅ |
| 详情：简介、导演、主演、国家、语言、平台、外部链接 | ✅ |
| 预告片播放（Bilibili，WebView） | ✅ |
| 我的：想看 / 在看 / 看过、年份柱状图、类型占比 | ✅ |
| 搜索：关键词 + 类型 / 评分 / 年份 / 形式 | ✅ |
| 下拉刷新、离线副本 | ✅ |
| 深链 `cinescope://` | ✅ |
| 分享图：840pt 小票版式（海报、评分、主创、简介、两个二维码） | ✅ |
| 分享预览 + 系统分享（图片文件） | ✅ |
| 豆瓣详情优先打开豆瓣 App，未安装时回落网页 | ✅ |
| Dynamic Type、减弱动效、减少透明度 | ✅ |
| 固定浅色（与网页 `color-scheme: light` 一致） | ✅ |
| Widget / 分享扩展 / Spotlight / Siri | ❌ 未纳入本次范围（Widget 与扩展还需付费账号） |

## 深链

```sh
xcrun devicectl device process launch --device <UDID> --terminate-existing \
  --payload-url 'cinescope://item?id=tv_cn:37191789' \
  cn.lrwei91.cinescope.ios
```

`id` 的格式是 `<分类 id>:<条目 id>`，分类 id 与网页端 `CATEGORY_CONFIG` 一致。也可以只切分类，或直达标签页：

```sh
xcrun devicectl device process launch --device <UDID> --payload-url 'cinescope://category?id=tv_kr' cn.lrwei91.cinescope.ios
xcrun devicectl device process launch --device <UDID> --payload-url 'cinescope://tab?id=collection' cn.lrwei91.cinescope.ios
```

`tab` 支持 `discover`、`collection`、`search`。这条通道既是产品能力（从 Safari、快捷指令跳转），也让命令行可以直达详情页与各标签页做界面验证——`devicectl` 本身不能模拟点击。

`share` 会在打开详情后立刻生成分享图，用于快捷指令直接分享某部作品，也用于真机验证：

```sh
xcrun devicectl device process launch --device <UDID> --payload-url 'cinescope://share?id=movie_cn:1292052' cn.lrwei91.cinescope.ios
```

## 分享与豆瓣跳转

分享图沿用网页端 `share.js` 的小票版式，由 `Features/Share/` 在本地生成：

- 840pt 画布、40pt 页边距，顶部 480pt 主视觉（海报 + 片名 + 评分 / 上映 / 类型），中间打孔虚线，下半部分是实时票房/热度、导演与主演、简介、两个二维码。
- 二维码用 CoreImage 本地生成，不请求网页端使用的 `api.qrserver.com`；两个码分别指向片单首页和豆瓣条目。
- 生成后先给预览页，再交给系统分享面板发送 JPEG 文件；分享面板里的「存储图像」可直接存相册。
- 海报下载失败时，版式会退化为无海报的纯文字主视觉，不会让整张分享图失败。

豆瓣详情默认打开豆瓣 App：`douban://douban.com/movie/<id>`，对电影与剧集都可直达条目；App 未安装或路由失败时回落到网页链接。实测 `douban://douban.com/subject/<id>/` 只会把豆瓣 App 拉到首页，因此没有采用。

## 视觉与动效

沿用网页端的白纸、黑墨与黄色（`#FFE28A`），原生界面采用电影手册与收藏票根的视觉语言：

- 发现页顶部合并品牌与分类入口，保留一排评分；类型多选进入筛选面板，底部固定重置和实际结果数量。更新时间进入分类面板，离线状态也保留在片单页脚。
- 海报无外围卡片框，评分为黄色角标，正文保留完整片名、日期、类型和未评分提示；票房、热度与更多元数据仍在详情中。
- 详情采用纸片海报、黄色评分块与清楚的章节标题；预告片主入口前置，正文支持选取与更宽松的行距。窄宽度题头可回退为纵向排版。
- 收藏用有缺口和虚线的纸质票根，搭配在看、看过两个统计入口；搜索保留原筛选语义，选中评分显示搜索自身的值。
- 浮动底栏使用黄色选中胶囊和短距离滑动；海报加载淡入 180ms，按压弹簧约 240ms，选中状态约 260ms。没有循环、视差或批量延迟入场。
- 系统减弱动效时取消自定义位移、缩放与淡入；减少透明度或高对比时，底栏使用不透明纸面。主要筛选和操作命中区至少 44pt。
- 首次进入后保留各标签页实例，切换标签保留搜索条件和列表上下文；更改分类、评分或类型时，发现列表回到顶部，搜索条件更改后结果回到顶部。

本轮设计来源、验证范围和剩余未验证项见 [iOS UI 验收记录](UI_ACCEPTANCE.md)。

## 性能约定

- `DateFormatter` 静态复用，不在列表里新建。
- 详情与卡片图片统一走 `URLCache`（64MB 内存 / 512MB 磁盘），避免重复下载海报。
- 网格只有一层 `LazyVGrid`，外层是普通 `VStack`；不做 `LazyVStack` 套 `LazyVGrid`。
- 筛选在内存数组上完成，不上网络；800 条以内单次筛选在毫秒级。

## 生成物

```sh
# App 图标（1024×1024，无 alpha）
swift ios/make-icon.swift ios/CineScope/Assets.xcassets/AppIcon.appiconset/AppIcon.png
```

图标几何来自 `assets/icons/app-icon.svg`，脚本用 CoreGraphics 直接绘制。受限环境里 `NSGraphicsContext` 会创建失败，因此不依赖 AppKit 绘图上下文。

## 回归测试

核心逻辑不依赖 UI，可直接在 macOS 上以真实 JSON 跑：

```sh
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
xcrun swiftc -parse-as-library \
  ios/CineScope/Core/Models.swift \
  ios/CineScope/Core/CategoryConfig.swift \
  ios/CineScope/Core/CatalogNormalizer.swift \
  ios/CineScope/Core/CatalogFilter.swift \
  ios/core-tests.swift -o /tmp/cinescope-core-tests
/tmp/cinescope-core-tests json          # 仓库内数据
/tmp/cinescope-core-tests /tmp/prod     # 也可指向线上数据的下载目录
```

覆盖剧集按季展开、去重、评分/类型/关键词筛选、排序、月份分组、高分模式、动画过滤与 embed URL 补齐。

## 验证状态

| 项目 | 结果 |
| --- | --- |
| Swift 编译（iPhone Simulator SDK / iPhone SDK，Debug） | ✅ BUILD SUCCEEDED |
| 静态分析（`xcodebuild analyze`） | ✅ ANALYZE SUCCEEDED，无警告 |
| 核心逻辑回归（仓库数据） | ✅ 32 项通过 |
| 核心逻辑回归（线上 JSON） | ✅ 32 项通过 |
| 线上 JSON 与海报可访问性 | ✅ `200`（`json/tv_cn_complete.json`、`posters/.../37191789.jpg`） |
| 真机安装（iPhone 17 / iOS 27.1） | ✅ `devicectl` 安装并启动 |
| 首页 / 详情 / 我的 / 搜索渲染 | ✅ 截图核对（深链直达详情与搜索词） |
| 深链 `item` / `tab` / `search` | ✅ |
| 分类抽屉、筛选点按、预告片播放、收藏列表 | ⏸ 未点按验证：`devicectl` 不能模拟点击 |

分享图与豆瓣跳转单独验证过：

| 项目 | 结果 |
| --- | --- |
| `cinescope://share?id=movie_cn:1292052` 生成电影分享图 | ✅ 截图核对：海报、9.7 分、主创、简介、两个二维码 |
| `cinescope://share?id=tv_cn:37191789` 生成剧集分享图 | ✅ 截图核对 |
| 豆瓣 App 路由 | ✅ 实测 `douban://douban.com/movie/<id>` 对电影与剧集都直达条目页；`douban://douban.com/subject/<id>/` 只会打开首页，已弃用 |
| 系统分享面板本身 | ⏸ 需要点按预览页右上角，命令行无法触发 |
| 模拟器运行 | ⏸ 本机没有安装 Simulator runtime |

以上为初版记录；后续 UI 改版的验证范围见 [iOS UI 验收记录](UI_ACCEPTANCE.md)。交互点按仍需与截图验证区分。首次启动时系统会弹一次「允许使用无线数据」，需要手动允许；命令行无法代答。
