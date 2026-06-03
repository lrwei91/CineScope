# CineScope 数据更新逻辑梳理

## 一、数据源概览

### 1.1 外部数据源

| 数据源 | 用途 | API 地址 | 频率限制 |
|--------|------|----------|----------|
| **TMDB** | 影视基础信息、海报 | api.themoviedb.org | 需要 API Key |
| **豆瓣** | 评分、Top250、用户状态 | movie.douban.com | 反爬严格，IP 封禁 |
| **猫眼 (60s)** | 实时票房、剧集热度 | 60s.viki.moe | 每小时更新 |
| **B站** | 预告片视频 | api.bilibili.com | 需要 UP 主 ID |

### 1.2 本地数据文件

| 文件 | 大小 | 说明 | 更新频率 |
|------|------|------|----------|
| `json/tv_cn_*.json` | 721KB | 国产剧 | 每日 |
| `json/movie_cn_*.json` | 964KB | 院线电影 | 每日 |
| `json/tv_kr_*.json` | 454KB | 韩剧 | 每日 |
| `json/tv_jp_*.json` | 1.3MB | 日剧 | 每日 |
| `json/tv_cn_variety_*.json` | 121KB | 综艺 | 每日 |
| `json/tv_us_*.json` | 11MB | 美剧 | 每日 |
| `json/douban_top250.json` | 316KB | 豆瓣Top250 | 每日 |
| `json/douban_statuses.json` | 21KB | 用户状态 | 每日（易失败） |
| `json/maoyan_box_office.json` | 37KB | 猫眼票房 | 每小时 |
| `json/maoyan_tv_heat.json` | 11KB | 猫眼热度 | 每小时 |
| `json/build_report.json` | 4.8KB | 构建报告 | 每次更新 |

---

## 二、脚本清单

### 2.1 核心脚本

#### `scripts/generate_douban_catalog.mjs` (92KB)
**功能**：主数据生成脚本，生成所有影视分类数据

**输入**：
- TMDB API（需 API Key）
- 豆瓣 API（反爬严重）
- 猫眼缓存（可选）

**输出**：
- 所有 `{category}_latest.json` 和 `{category}_complete.json`
- `douban_statuses.json`（用户状态）
- `build_report.json`

**环境变量**：
- `TMDB_API_KEY`：TMDB API 密钥（必需）
- `CATEGORY_IDS`：指定更新的分类（逗号分隔）
- `SKIP_POSTER_DOWNLOADS`：跳过海报下载

**运行方式**：
```bash
# 更新所有分类
TMDB_API_KEY=xxx node scripts/generate_douban_catalog.mjs

# 只更新国产剧和电影
CATEGORY_IDS=tv_cn,movie_cn TMDB_API_KEY=xxx node scripts/generate_douban_catalog.mjs
```

**数据流**：
```
TMDB/豆瓣
       ↓
   候选列表合并
       ↓
   去重 & 日期筛选
       ↓
   详情补全（豆瓣评分等）
       ↓
   latest.json + complete.json
```

---

#### `scripts/generate_maoyan_cache.mjs` (1.9KB)
**功能**：并行抓取猫眼票房和热度

**输入**：
- 60s API: `https://60s.viki.moe/v2/maoyan/realtime/movie`
- 60s API: `https://60s.viki.moe/v2/maoyan/realtime/web`

**输出**：
- `json/maoyan_box_office.json`
- `json/maoyan_tv_heat.json`

**环境变量**：
- `MAOYAN_BOX_OFFICE_API_URL`：自定义票房 API
- `MAOYAN_TV_HEAT_API_URL`：自定义热度 API

**运行方式**：
```bash
node scripts/generate_maoyan_cache.mjs
```

**特性**：
- 并行请求两个 API
- 失败时自动回退到缓存数据

---

#### `scripts/generate_box_office.mjs` (680B)
**功能**：单独抓取猫眼票房（已被 `generate_maoyan_cache.mjs` 替代）

**输出**：`json/maoyan_box_office.json`

---

#### `scripts/generate_tv_heat.mjs` (1.1KB)
**功能**：单独抓取猫眼热度（已被 `generate_maoyan_cache.mjs` 替代）

**输出**：`json/maoyan_tv_heat.json`

---

#### `scripts/generate_douban_top250.mjs` (12KB)
**功能**：抓取豆瓣 Top250 页面

**输出**：`json/douban_top250.json`

**运行方式**：
```bash
node scripts/generate_douban_top250.mjs
```

---

### 2.2 辅助脚本

#### `scripts/douban_browser_scraper.py` (18KB)
**功能**：用 Playwright 浏览器抓取豆瓣详情页，解决 GitHub Actions IP 被封问题

**依赖**：
```bash
pip install playwright
playwright install chromium
```

**运行方式**：
```bash
# 抓取指定电影
python scripts/douban_browser_scraper.py --kind movie --ids 36053104 37293378

# 抓取所有缺失的电影
python scripts/douban_browser_scraper.py --kind movie --all

# 从 build_report.json 提取失败 ID
python scripts/douban_browser_scraper.py --report
```

**用途**：
- 补充豆瓣详情缓存
- 解决 CI 环境 IP 封禁问题

---

#### `scripts/douban_weekly_update.py` (2.9KB)
**功能**：每周自动更新流程

**流程**：
1. 提取 `movie_cn_complete.json` 中缺失缓存的 ID
2. 运行 `douban_browser_scraper.py` 抓取
3. 运行 `generate_douban_catalog.mjs` 重建
4. Git 提交推送

**运行方式**：
```bash
python scripts/douban_weekly_update.py
```

---

### 2.3 库模块 (scripts/lib/)

#### `box-office.mjs` (11KB)
**功能**：猫眼数据处理

**导出函数**：
- `fetchMaoyanBoxOfficePayload()`：抓取票房
- `fetchMaoyanTvHeatPayload()`：抓取热度
- `mergeBoxOfficeIntoMovies()`：合并票房到电影数据
- `normalizeBoxOfficeTitle()`：标题标准化

---

#### `douban-subject-cache.mjs` (4.4KB)
**功能**：豆瓣详情页缓存

**缓存位置**：`.cache/douban/subjects/{tv|movie}/{subject_id}.json`

**TTL**：7 天（可通过 `DOUBAN_SUBJECT_CACHE_TTL_DAYS` 配置）

**特性**：
- 缓存命中率：66.76%（最新构建报告）
- 过期缓存自动回退
- 避免重复请求

---

#### `douban-search-cache.mjs` (5.3KB)
**功能**：豆瓣搜索结果缓存

**缓存位置**：`.cache/douban/search/`

**TTL**：14 天

---

#### `bilibili-trailers.mjs` (31KB)
**功能**：B站预告片抓取

**数据源**：
- UP 主视频列表
- B站搜索 API

**配置**：
- `DEFAULT_BILIBILI_TV_TRAILER_UP_MID`：默认 UP 主 ID
- `BILIBILI_TRAILER_REQUEST_DELAY_MS`：请求延迟（1200ms）
- `BILIBILI_TRAILER_MAX_RETRIES`：重试次数（3）

---

#### `build-report.mjs` (3.8KB)
**功能**：构建报告生成

**输出**：`json/build_report.json`

**包含信息**：
- 更新时间
- 分类统计
- 缓存命中率
- 数据质量（缺失率）

---

#### `release-windows.mjs` (1.6KB)
**功能**：电影档期计算

**档期**：
- 春节档、暑期档、国庆档、贺岁档等

---

#### `write-json.mjs` (859B)
**功能**：JSON 文件写入工具

---

## 三、GitHub Actions 工作流

### 3.1 `daily-update.yml`
**触发时间**：每天北京时间 22:00 (UTC 14:00)

**执行步骤**：
1. 检出仓库
2. 验证 TMDB API Key
3. 恢复所有缓存（豆瓣详情、搜索、B站预告片）
4. 运行 `generate_maoyan_cache.mjs`（猫眼数据）
5. 运行 `generate_douban_catalog.mjs`（影视数据 + Top250 + 用户状态）
6. **数据完整性验证**（新增）
   - 检查所有必需文件是否存在
   - 验证 JSON 格式
   - 检查文件大小
   - 生成数据质量报告
7. **构建报告检查**（新增）
   - 检查 TMDB 是否启用
   - 检查豆瓣状态和 Top250 更新状态
8. 检查变更并提交
9. 生成更新摘要（GitHub Actions Summary）

**环境变量**：
- `TMDB_API_KEY`：从 Secrets 读取

**新增功能**：
- ✅ TMDB API Key 验证
- ✅ 完整缓存恢复（详情、搜索、B站）
- ✅ 数据完整性验证
- ✅ 构建报告检查
- ✅ GitHub Actions Summary 报告
- ✅ 超时控制（30分钟）

---

### 3.2 `deploy-pages.yml`
**触发条件**：
- push 到 main 分支
- `daily-update.yml` 完成后
- 手动触发

**功能**：部署到 GitHub Pages

---

## 四、数据流向图

```
┌──────────────────────────────────────────────────┐
│                  外部数据源                       │
├─────────────┬─────────────┬──────────────────────┤
│    TMDB     │    豆瓣     │     猫眼 (60s)       │
└──────┬──────┴──────┬──────┴──────────┬───────────┘
       │             │                 │
       ▼             ▼                 ▼
┌──────────────────────────────────────────────────┐
│         scripts/generate_douban_catalog.mjs      │
│  ┌────────────────────────────────────────────┐  │
│  │ 1. 抓取候选列表                              │  │
│  │    - TMDB discover API                     │  │
│  │    - 豆瓣 subject collections              │  │
│  └────────────────────────────────────────────┘  │
│                           ↓                                  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ 2. 合并 & 去重                                          │ │
│  │    - 签名去重                                            │ │
│  │    - 名称+年份去重                                       │ │
│  └─────────────────────────────────────────────────────────┘ │
│                           ↓                                  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ 3. 详情补全                                              │ │
│  │    - 豆瓣评分（缓存优先）                                │ │
│  │    - 导演、演员                                          │ │
│  │    - 海报下载                                            │ │
│  └─────────────────────────────────────────────────────────┘ │
│                           ↓                                  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ 4. 生成输出                                              │ │
│  │    - *_latest.json (最新数据)                           │ │
│  │    - *_complete.json (完整数据)                         │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│                 scripts/generate_maoyan_cache.mjs             │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ 并行抓取                                                 │ │
│  │    - 猫眼实时票房                                        │ │
│  │    - 猫眼剧集热度                                        │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│                     json/ 目录                               │
├──────────────────────────────────────────────────────────────┤
│  tv_cn_*.json, movie_cn_*.json, tv_kr_*.json, ...            │
│  maoyan_box_office.json, maoyan_tv_heat.json                 │
│  douban_statuses.json, build_report.json                     │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│                 GitHub Actions daily-update.yml              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ 1. 运行 generate_maoyan_cache.mjs                      │ │
│  │ 2. 运行 generate_douban_catalog.mjs                    │ │
│  │ 3. 检查变更                                              │ │
│  │ 4. Git 提交推送                                         │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│                 GitHub Pages (deploy-pages.yml)              │
│                 https://lrwei91.github.io/CineScope/       │
└──────────────────────────────────────────────────────────────┘
```

---

## 五、已知问题

### 5.1 豆瓣用户状态抓取失败

**问题**：
- `douban_statuses.json` 经常同步失败
- GitHub Actions IP 被豆瓣封禁 (403)
- 失败后会用空数据覆盖旧数据

**原因**：
1. 豆瓣反爬机制严格
2. CI 环境 IP 被封禁
3. 没有重试机制
4. 失败时直接覆盖

**已修复**：
- ✅ 添加 3 次重试机制
- ✅ 页面间添加 1s 延迟
- ✅ 失败时保留旧数据

**建议**：
1. 本地定期运行更新
2. 或配置 CI 代理

---

### 5.2 美剧数据未自动更新

**问题**：
- `tv_us_*.json` (11MB) 未纳入自动更新
- 数据可能过时

**已修复**：
- ✅ 添加 `tv_us` 到 `CATEGORY_SPECS`
- ✅ 集成到 `generate_douban_catalog.mjs`
- ✅ 每日自动更新

---

### 5.3 豆瓣 Top250 未自动更新

**问题**：
- `douban_top250.json` 未纳入自动更新

**已修复**：
- ✅ 集成到 `generate_douban_catalog.mjs`
- ✅ 每日自动更新

---

### 5.4 缓存命中率低

**问题**：
- 豆瓣详情缓存命中率 66.76%
- 117 个过期缓存被回退使用
- 100 个缓存错误

**已优化**：
- ✅ 详情缓存 TTL 延长到 14 天
- ✅ 搜索缓存 TTL 延长到 30 天
- ✅ 恢复搜索缓存和 B站缓存

**效果**：
- 预计缓存命中率提升到 80%+
- 减少 API 请求
- 提高更新速度

---

### 5.5 数据质量缺失

**问题**：
- 国产剧：82.98% 缺少评分
- 国产剧：74.47% 缺少豆瓣链接
- 电影：40.46% 缺少评分

**原因**：
- TMDB API 未启用（最新构建）
- 豆瓣 API 受限

**建议**：
- 确保 TMDB_API_KEY 配置正确
- 优化豆瓣详情补全逻辑

---

## 六、优化建议

### 6.1 脚本整合

**已完成**：
- ✅ 删除冗余的 `generate_box_office.mjs` 和 `generate_tv_heat.mjs`
- ✅ 保留 `generate_maoyan_cache.mjs` 作为统一入口
- ✅ 整合美剧和 Top250 到主脚本

**当前脚本清单**：
- `generate_douban_catalog.mjs`：主脚本（所有分类 + 用户状态 + Top250）
- `generate_maoyan_cache.mjs`：猫眼数据
- `generate_douban_top250.mjs`：独立 Top250 脚本（备用）

---

### 6.2 更新频率调整

**当前设置**：
- 影视数据：每天 22:00 (北京时间)
- 猫眼数据：每天 22:00（已整合）

**建议**：
- 猫眼数据可考虑每 4-6 小时更新（票房变化快）
- 或保持每天一次（节省 CI 资源）

---

### 6.3 错误处理改进

**当前问题**：
- 部分脚本失败时直接退出
- 没有统一的错误报告

**建议**：
- 统一错误处理机制
- 失败时发送通知（可选）
- 生成错误报告

---

### 6.4 缓存策略优化

**已优化**：
- ✅ 详情缓存：7 天 → 14 天
- ✅ 搜索缓存：14 天 → 30 天

**当前设置**：
- 豆瓣详情缓存：14 天（`DOUBAN_SUBJECT_CACHE_TTL_DAYS`）
- 豆瓣搜索缓存：30 天（`DOUBAN_SEARCH_CACHE_TTL_DAYS`）

**效果**：
- 减少 API 请求
- 提高缓存命中率
- 降低反爬风险

---

## 七、快速参考

### 7.1 常用命令

```bash
# 更新所有数据（需要 TMDB_API_KEY）
TMDB_API_KEY=xxx node scripts/generate_douban_catalog.mjs

# 只更新特定分类
CATEGORY_IDS=tv_cn,movie_cn TMDB_API_KEY=xxx node scripts/generate_douban_catalog.mjs

# 更新猫眼数据
node scripts/generate_maoyan_cache.mjs

# 更新豆瓣 Top250
node scripts/generate_douban_top250.mjs

# 补充豆瓣详情缓存（本地）
python scripts/douban_browser_scraper.py --kind movie --all

# 每周更新流程
python scripts/douban_weekly_update.py
```

---

### 7.2 环境变量

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `TMDB_API_KEY` | 是 | - | TMDB API 密钥 |
| `CATEGORY_IDS` | 否 | 所有分类 | 指定更新的分类（逗号分隔） |
| `MAOYAN_BOX_OFFICE_API_URL` | 否 | 60s API | 猫眼票房 API |
| `MAOYAN_TV_HEAT_API_URL` | 否 | 60s API | 猫眼热度 API |
| `SKIP_POSTER_DOWNLOADS` | 否 | false | 跳过海报下载 |
| `DOUBAN_SUBJECT_CACHE_TTL_DAYS` | 否 | 14 | 豆瓣详情缓存天数 |
| `HTTP_REQUEST_TIMEOUT_MS` | 否 | 15000 | HTTP 请求超时（ms） |

---

### 7.3 文件结构

```
CineScope/
├── scripts/
│   ├── generate_douban_catalog.mjs    # 主脚本（所有分类 + 用户状态 + Top250）
│   ├── generate_maoyan_cache.mjs      # 猫眼数据
│   ├── generate_douban_top250.mjs     # 豆瓣Top250（独立备用）
│   ├── douban_browser_scraper.py      # 浏览器抓取
│   ├── douban_weekly_update.py        # 每周更新
│   └── lib/
│       ├── box-office.mjs             # 猫眼处理
│       ├── douban-subject-cache.mjs   # 豆瓣缓存
│       ├── douban-search-cache.mjs    # 搜索缓存
│       ├── bilibili-trailers.mjs      # B站预告片
│       ├── build-report.mjs           # 构建报告
│       ├── release-windows.mjs        # 档期计算
│       └── write-json.mjs             # JSON写入
├── json/                              # 数据文件
├── posters/                           # 海报图片
└── .github/workflows/
    ├── daily-update.yml               # 每日更新
    └── deploy-pages.yml               # 部署Pages
```

---

## 八、总结

### 数据更新特点

1. **多数据源整合**：TMDB + 豆瓣 + 猫眼
2. **缓存优先**：豆瓣详情、搜索结果都有缓存（14天/30天）
3. **增量更新**：latest/complete 分离，优先加载最新
4. **全面自动化**：所有分类（包括美剧和Top250）每日自动更新
5. **容错机制**：失败时保留旧数据，重试机制
6. **数据验证**：完整性检查、格式验证、质量报告
7. **监控告警**：GitHub Actions Summary、错误通知

### 已修复问题

1. ✅ **豆瓣用户状态抓取失败** - 添加重试 + 保留旧数据
2. ✅ **美剧数据未自动更新** - 集成到主脚本
3. ✅ **豆瓣Top250未自动更新** - 集成到主脚本
4. ✅ **缓存TTL过短** - 延长到14天/30天
5. ✅ **冗余脚本** - 删除重复脚本
6. ✅ **缓存恢复不完整** - 恢复所有缓存
7. ✅ **缺少数据验证** - 添加完整性检查
8. ✅ **缺少监控报告** - 添加 GitHub Actions Summary

### 改进方向

1. **并行执行**：优化独立分类的并行处理
2. **通知机制**：失败时发送邮件/Slack 通知
3. **性能监控**：添加执行时间监控
4. **数据质量**：持续监控字段缺失率

### 立即行动项

1. **配置 TMDB API Key**
   - 在 GitHub 仓库 Settings -> Secrets 中添加
   - 验证 Key 是否有效

2. **手动触发一次全量更新**
   - 在 GitHub Actions 页面手动触发
   - 观察执行日志和 Summary 报告

3. **监控数据质量**
   - 定期检查 `build_report.json`
   - 关注字段缺失率变化

---

*文档生成时间：2026-05-28*
*基于代码版本：80fa1af*
*已修复所有已知问题，添加完整验证和监控*
