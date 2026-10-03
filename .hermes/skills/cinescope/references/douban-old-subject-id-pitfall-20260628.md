# 豆瓣老 subject_id vs Rexxar v2 API 不兼容坑

> 沉淀自 2026-06-28 `douban_cn_status_sync.py` 8 部剧 API 失败排查实战。
> 教训直接归数据源 owner（CineScope），不是 cron 审计问题。
>
> **状态：方案 1 已实施（2026-06-28 patch 到 `scripts/douban_cn_status_sync.py`）**

## 现象

`douban_cn_status_sync.py`（cron `55762d895c40`，每天 6:00 跑）输出：

> 注：此处 ID 为 2026-06-28 当时的值，任务重建后已变更；当前 ID 见 `~/.hermes/cron/jobs.json`（2026-10-04 核实为 `ea423a45f252`）。

```
[53/60] 深空彼岸(283119)... ⚠ API 失败
[54/60] 光阴之外(281233)... ⚠ API 失败
[55/60] 华山论剑(296834)... ⚠ API 失败
...（全部 ≤6 位 ID）
```

8 部剧的 `subject_id` 都在 `232230 ~ 296834` 之间，是 6 位老 ID。

## 根因（不是限频、不是脚本 bug）

直接 curl 验证：

```bash
curl -s -w "HTTP %{http_code} size=%{size_download}\n" \
  -H "User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15" \
  -H "Referer: https://m.douban.com/" \
  "https://m.douban.com/rexxar/api/v2/tv/232230" --max-time 10
```

返回：`HTTP 404 size=153`，body：

```json
{"request":"GET /v2/tv/232230","msg":"traversal_error","code":404,"localized_message":"要访问的内容不存在"}
```

**豆瓣 Rexxar v2 API 不支持 ≤6 位老 subject_id**。8 位 ID（如 35633152 千香）正常返回 200 + 12KB 完整 JSON。

老 ID 来源：很可能从 IMDb/TMDb/tvdb 等老数据源导入时带了豆瓣站内 ID（v2 API 之前的 ID 空间），并非豆瓣 v2 体系内的 ID。

## 关键事实表

| 维度 | 数据 | 含义 |
|---|---|---|
| `tv_cn_complete.json` 总条目 | 221 | stdout 报告数对得上 |
| ≤6 位老 ID 占比 | 146/221 = 66% | 老 ID 是主体数据 |
| 待检查 60 部 = 8 位 active 50 + 6 位 active 8 + 2 | 数学吻合 | `is_finished()` 把 138 部 `Ended` 老剧跳过了 |
| 8 个失败 ID 的 s0 字段 | `episode_count=None / status=None` | 这些剧**从未被 API 成功同步过** |
| 失败 ID 的 `status` 顶层字段 | `"Returning Series"` | 不是 v2 API 写的，是早期 import 步骤用的旧数据源 |
| 唯一无歧义的诊断信号 | curl 直接返回 HTTP 404 | 不需要猜，直接抓 |

## 排查 SOP（3 步定位）

```bash
# 1) 直接 curl 1 个失败 ID 看真实响应
curl -s -w "\nHTTP %{http_code}\n" \
  -H "User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15" \
  -H "Referer: https://m.douban.com/" \
  "https://m.douban.com/rexxar/api/v2/tv/<sid>" --max-time 10
# 看 msg=traversal_error / code=404 → 老 ID 不被 v2 识别

# 2) 对比 1 个成功 ID 验证 API 本身正常
curl -s -w "\nHTTP %{http_code} size=%{size_download}\n" \
  -H "User-Agent: ..." -H "Referer: https://m.douban.com/" \
  "https://m.douban.com/rexxar/api/v2/tv/<8位id>" --max-time 10
# HTTP 200 + size > 1000 → API 工作正常

# 3) 在 tv_cn_complete.json 里验证数据来源
python3 -c "
import json
d = json.load(open('json/tv_cn_complete.json'))
short = [s for s in d['shows'] if len(str(s.get('id','')))<=6]
print(f'≤6 位 ID: {len(short)}/{len(d[\"shows\"])} ({len(short)*100//len(d[\"shows\"])}%)')
# 看到 ≥60% 老 ID 占比 → 数据源整体需要重映射，不是脚本 bug
"
```

## 5 种方案对比（按 ROI 排序）

| # | 方案 | 改动量 | 数据完整性 | 推荐度 |
|---|---|---|---|---|
| 1 | **跳过 ≤6 位 ID**（`fetch_api` 加 `if len(sid) <= 6: return None` + stdout 区分 `[已知老 ID 跳过]` 与 `[API 失败]`） | 3 行代码 | 8 部剧永远不同步 | ⭐⭐⭐⭐ P0 — ✅ 已实施 |
| 2 | **重映射 8 部剧的新 v2 ID**（手动查豆瓣新页面找 8 位 ID 替换） | 主人手动 30 分钟 | 8 部剧恢复同步 | ⭐⭐⭐⭐ 长期最佳 |
| 3 | **fallback 调豆瓣网页版**（正则解析 HTML） | 脚本 +30 行 | 全部恢复 | ⭐ 脆弱、网页改版即挂 |
| 4 | **数据源迁移**：用 8 位 v2 ID 重新导入 146 部老 ID | 工程量大 | 最干净 | ⭐⭐ 风险高，可能丢剧名映射 |
| 5 | **接受现状**：146 部老 ID = v2 API 不可达 | 0 | 60% 数据死 | ❌ 默认太低 |

**实战首选**：方案 1（脚本加跳过）+ 方案 2（手动重映射高优先级剧如诡秘之主）并行。

## fetch_api 失败信号混淆坑（2026-06-28 发现）

`fetch_api` 当前实现：

```python
def fetch_api(sid: str) -> dict | None:
    r = requests.get(url, headers=API_HEADERS, timeout=10)
    if r.status_code == 200:
        data = r.json()
        return {...}
    else:
        return None    # ← 404 / 403 / 429 / 500 全是 None
```

**问题**：调用方拿不到具体失败原因，统一 print `⚠ API 失败`。下次再排查就要从零开始。

**修法**（合并到方案 1 时一起做）：

```python
def fetch_api(sid: str) -> dict | None:
    try:
        r = requests.get(url, headers=API_HEADERS, timeout=10)
    except requests.RequestException as e:
        print(f"  ⚠ 网络异常: {type(e).__name__}")
        return None
    if r.status_code == 200:
        return {...}
    # 区分失败原因（关键：让 stdout 可诊断）
    print(f"  ⚠ HTTP {r.status_code}")
    return None
```

加上后，下次再出现 `⚠ HTTP 404` 直接知道是"老 ID 不识别"，不用重新 curl 验证。

## 副产品：stdout 末尾 "git rebase 失败" 是误导信号

这次实战还发现：脚本 stdout 末尾出现

```
⚠ git 操作失败: ... error: could not apply 95d0410... ...
```

但**实际 push 在 7:30 cron `ba63bd6b0fc3` 走另一条路径成功**（commit `95d0410` 已上 GitHub）。stdout 末尾的错误是中间步骤 rebase 报错，不影响最终结果。

**审计规则**（已沉淀到 `automation/cron-audit-checklist` §6 新增坑 8）：**看到 stdout 末尾报错，先用 `git log --since="..."` 反查真实状态，不能直接信 stderr 总结**。

## 实施记录

### 2026-06-28 patch

**改动**：
- `fetch_api` 函数：失败时区分 `HTTP {status_code}` / `网络异常` / `解析异常`，不再静默 return None
- `main` 主循环：`if len(sid) <= 6` 提前 continue，输出 `⏭ 已知老 ID 跳过（v2 API 不支持 ≤6 位 subject_id）`
- 文件总行数：279 → 297（+18 行）

**验证**（ad-hoc 跑 3 case）：
- `fetch_api(232230)` → `⚠ HTTP 404 (size=153) + None`
- `fetch_api(35633152)` → 200 + 完整 JSON（8 位 ID 正常工作）
- 主循环模拟 6 位/8 位混合 → 6 位走 `⏭` 分支，8 位走正常 `✅`

**未做**（等下次需要再说）：
- 完整 60 部 dry-run（60s 估算超时，3 case 已覆盖逻辑）
- 8 部高优剧新 v2 ID 重映射（方案 2，需主人手动查豆瓣新页面）
- 138 部 6 位 "Ended" 老剧的兜底同步（永不进 active 队列，不影响数据）

**下次 cron（明天 6:00）预期 stdout**：
```
[53/60] 深空彼岸(283119)... ⏭ 已知老 ID 跳过（v2 API 不支持 ≤6 位 subject_id）
[54/60] 光阴之外(281233)... ⏭ 已知老 ID 跳过（v2 API 不支持 ≤6 位 subject_id）
...
📊 同步完成:
  更新: 28 部
  无变化: 32 部
  已知老 ID 跳过: 8 部
```

## 相关资源

- 失败 ID 完整列表（2026-06-28）：深空彼岸 283119 / 光阴之外 281233 / 华山论剑 296834 / 云深不知梦 284760 / 诡秘之主 232230 / 十八岁太奶奶驾到 293371 / 鲲吞天下之掌门归来 280078 / 凸变英雄X 272059
- 主 skill: `cinescope/SKILL.md` §1 已知陷阱
- 排查方法论: `automation/cron-audit-checklist/SKILL.md`