# 自动抓取和部署

## 配置步骤

### 1. 在 GitHub 上配置 TMDB API Key Secret

1. 进入 GitHub 仓库页面：https://github.com/lrwei91/latest_tv
2. 点击 **Settings** → **Secrets and variables** → **Actions**
3. 点击 **New repository secret**
4. 添加：
   - Name: `TMDB_API_KEY`
   - Value: `940bf0d9cff756127b93eb51976a3aba`

### 2. 启用 GitHub Pages（如果还未启用）

1. 进入 **Settings** → **Pages**
2. Source 选择 **GitHub Actions**
3. 或者选择 **Deploy from a branch**，branch 选 `main`，folder 选 `/ (root)`

## 自动化说明

### 定时抓取
- 每天北京时间早上 6:00 自动运行
- 抓取豆瓣和 TMDB 的最新影视数据
- 如果有数据变更，自动提交并推送

### 手动触发
1. 进入 **Actions** 标签页
2. 点击 **每日自动抓取并部署** workflow
3. 点击 **Run workflow** 按钮

### 部署
- 每次成功推送后，如果配置了 GitHub Pages，会自动触发部署
- 可以在 **Actions** 标签页查看部署状态

## 本地测试

```bash
# 本地运行抓取脚本
export TMDB_API_KEY=940bf0d9cff756127b93eb51976a3aba
node scripts/generate_douban_catalog.mjs

# 查看变更
git status

# 手动提交
git add .
git commit -m "手动更新影视数据"
git push
```
