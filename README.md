# CineScope

影视内容聚合展示平台，实时追踪全球热门影视动态。

[在线体验](https://lrwei91.github.io/CineScope/) · [反馈建议](https://github.com/lrwei91/CineScope/issues)

## 预览

![预览图](preview.png)

## 功能特性

### 影视分类

| 分类 | 说明 |
|------|------|
| 国产剧 | 大陆热播剧集 |
| 院线电影 | 正在上映及即将上映 |
| 综艺 | 大陆综艺节目 |
| 韩剧 | 韩国电视剧 |
| 日剧 | 日本电视剧 |
| 美剧 | 美国电视剧 |
| 豆瓣 Top250 | 经典佳作 |

### 智能筛选

- **评分筛选**：全部 / >9分 / >8分 / >7分 / 近2年高分
- **类型筛选**：根据当前分类动态生成
- **平台筛选**：按播出平台/电视网筛选（院线电影除外）

### 浏览体验

- **时间线导航**：按年月快速定位
- **分页加载**：滚动时渐进加载，首屏秒开
- **懒加载策略**：优先加载最新数据，后台补全完整数据

### 数据整合

- **猫眼票房**：院线电影实时票房数据
- **猫眼热度**：国产剧实时热度排行
- **豆瓣状态**：同步个人想看/在看/看过状态

## 技术架构

### 数据源

| 来源 | 内容 |
|------|------|
| TMDB | 影视基础信息、海报 |
| 豆瓣 | 评分、Top250、用户状态 |
| 猫眼 60s | 实时票房、剧集热度 |

### 加载策略

```
首页 → tv_cn_latest.json (首屏)
        ↓
      tv_cn_complete.json (后台)
        ↓
      切换分类 → 各分类 latest → complete
```

- 首屏只加载当前分类的最新数据
- 切换分类时按需加载
- 已加载分类命中缓存，不重复请求

### 自动更新

GitHub Actions 每天 22:00 (北京时间) 自动刷新数据：

- 影视分类数据（国产剧、电影、韩剧、日剧、综艺、美剧）
- 豆瓣 Top250
- 豆瓣用户状态
- 猫眼票房 & 热度缓存

## 快速开始

### 环境要求

- Node.js 18+
- TMDB API Key

### 安装

```bash
git clone https://github.com/lrwei91/CineScope.git
cd CineScope
cp .env.example .env
# 编辑 .env 填入 TMDB_API_KEY
```

### 刷新数据

```bash
# 刷新影视分类数据
TMDB_API_KEY=你的key node scripts/generate_douban_catalog.mjs

# 刷新猫眼缓存
node scripts/generate_maoyan_cache.mjs
```

### 本地运行

直接用任意静态服务器托管：

```bash
# Python
python -m http.server 8000

# Node.js
npx serve .
```

访问 `http://localhost:8000`

## 项目结构

```
CineScope/
├── index.html          # 主页面
├── app.js              # 核心逻辑
├── style.css           # 样式
├── js/modules/         # 功能模块
│   ├── data-loader.js  # 数据加载
│   ├── renderer.js     # 渲染引擎
│   ├── filters.js      # 筛选逻辑
│   └── ...
├── json/               # 数据文件 (LFS)
├── posters/            # 海报图片 (LFS)
└── scripts/            # 数据生成脚本
```

## 数据格式

### TV 分类

```json
{
  "shows": [{
    "id": 123,
    "name": "剧名",
    "original_name": "Original Title",
    "genres": [{ "name": "剧情" }],
    "seasons": [{
      "douban_rating": "8.2",
      "douban_link_verified": true
    }]
  }]
}
```

### 电影分类

```json
{
  "movies": [{
    "id": 123,
    "title": "片名",
    "release_date": "2026-04-01",
    "douban_rating": "8.2",
    "box_office": {
      "cumulative_box_office": "129.48亿",
      "rank": 1
    }
  }]
}
```

## Git LFS

大型数据文件（JSON + 海报）使用 Git LFS 存储：

```bash
# 正常 clone（自动下载 LFS 文件）
git clone https://github.com/lrwei91/CineScope.git

# 仅 clone 代码（跳过 LFS）
GIT_LFS_SKIP_SMUDGE=1 git clone https://github.com/lrwei91/CineScope.git
```

## 许可证

MIT License

## 致谢

- [TMDB](https://www.themoviedb.org/) - 影视数据
- [豆瓣](https://movie.douban.com/) - 评分数据
- [猫眼](https://maoyan.com/) - 票房数据
