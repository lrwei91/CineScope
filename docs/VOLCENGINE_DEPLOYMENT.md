# 火山云静态部署

生产域名保持 `movie.lrwei91.cn`，页面、JSON 与海报的路径不变。服务器仅提供静态文件，数据更新仍由现有 GitHub Actions 和本地标准 runner 完成。

## 发布与容量

- Nginx 读取 `/srv/cinescope/current`，它指向 `releases/<完整提交 SHA>`。
- `cinescope-update.timer` 每 5 分钟运行 `/opt/cinescope-ops/deploy.py`，只从公开 GitHub 仓库拉取 `main` 的确定提交。`/var/lib/cinescope/source` 为独立 shallow Git 构建缓存，更新只传输变化的对象，不反复下载全部海报；成功后清理 Git 旧对象。
- 独立的 `cinescope` 用户运行检查与构建，没有 root 权限，不保存 GitHub token 或 SSH 私钥。
- 发布前执行 `npm run check` 和 `npm run build:site`；通过后原子切换，再核对本机 HTTP 的页面、脚本、所有标准 JSON 与抽样海报的 SHA-256。
- 切换后验证失败自动恢复旧目录；验证成功才删除旧发布目录，正常状态只保留一版。更新期间临时存在源码、新旧两版，磁盘必须预留空间。
- 临时目录自动清理；源码与 Git 缓存另占一份固定工作空间，不作为历史发布。锁阻止并行发布；相同 SHA 静默跳过，失败由 systemd/journal 记录，下次定时检查会重试。
- 构建仅包含 17 份标准 JSON 和当前数据引用的本地海报；源海报、历史副本不会被删除。随数据变化，容量与引用数量会变化。
- Vercel `git.deploymentEnabled=false` 禁止新 Git 部署。不要再建立第二条自动部署链路。

## 首次安装

使用既有 SSH 配置接入服务器；服务器地址、密钥和账号接入信息不写入本仓库。先安装 Node.js 18+、Python 3.9+、requests、Git、Nginx、curl 和 Certbot；安装不执行数据抓取。

1. 创建系统用户 `cinescope`，将 `/srv/cinescope` 和 `/var/lib/cinescope` 归该用户所有，目录允许 Nginx 读取。
2. 把 `deploy.py` 安装到 root 持有的 `/opt/cinescope-ops/`，把 service/timer 安装到 `/etc/systemd/system/`。
3. 把 `cinescope-static.inc` 安装到 `/etc/nginx/`，先用 `cinescope-http.conf` 配置 loopback 校验入口和 ACME HTTP challenge，执行 `nginx -t` 后 reload。
4. 先发布到 loopback，通过后准备域名证书；只有目标站点 HTTPS 内容验证成功后才将 DNS 切到服务器。
5. 正式站点使用 `cinescope-nginx.conf`。证书通过 Certbot webroot 续期，webroot 为 `/var/lib/letsencrypt`；续期 deploy hook 必须执行 `nginx -t && systemctl reload nginx`。
6. 完成公网与内容哈希验证后启用 timer：`systemctl enable --now cinescope-update.timer`。

如果首次证书通过 DNS challenge 签发，切换 DNS 后需把续期方式改为 webroot，并用 staging dry-run 验证续期，不能把一次性手工 DNS challenge 当成自动续期。

把 `deploy/linux/cinescope-certbot-deploy.sh` 以 root 所有、0755 权限安装到 `/etc/letsencrypt/renewal-hooks/deploy/cinescope-nginx.sh`。它只对本项目证书生效。`certbot reconfigure --cert-name movie.lrwei91.cn --webroot --webroot-path /var/lib/letsencrypt --preferred-challenges http --non-interactive` 会先验证新的续期方式再保存；首次 DNS challenge 的偏好需要显式覆盖。

## 检查与手动发布

```sh
systemctl status nginx cinescope-update.timer
systemctl list-timers cinescope-update.timer
journalctl -u cinescope-update.service -n 80 --no-pager
sudo -u cinescope /usr/bin/python3 /opt/cinescope-ops/deploy.py --check
systemctl start cinescope-update.service
cat /srv/cinescope/current/.deployed-revision
```

`--check` 只检查远端版本。域名 HTTPS 和本机 `http://127.0.0.1:18081/` 应返回同一份内容。Nginx 禁止访问点文件，发布 SHA 标记仅供本机运维读取。

## 回退

发布过程中的 HTTP 校验失败会自动回退旧目录。成功清理旧版本后，回退需要在 GitHub 提交修复或恢复内容形成新提交，再由相同发布入口验证发布；没有本机旧部署可立即切回。不要把旧源码复制进 current，或把 source tree 直接作为 Nginx root。

代码与 ops 模板的修改推送后，公开页面会自动更新；`/opt/cinescope-ops/`、Nginx 和 systemd 模板需要经审阅后显式安装，不允许仓库脚本自动改写 root 配置。

## 迁移验收记录

2026-10-30（北京时间）：正式域名已从 Vercel CNAME 切到火山云 A 记录。服务器 Node 24、Python 3.9 实际运行完整检查、数据门禁和静态构建通过，发布包含 17 份标准 JSON 与 1,489 张引用海报，产物约 269 MB（十进制文件字节）。服务器已从 GitHub 增量获取下一提交并完成发布，旧发布目录按预期清理。

域名证书已签发，切换前公网直连服务器验证首页、JS、清单、片单 JSON 和海报的 SHA-256 一致；切换后正式域名响应为 Nginx。Certbot reconfigure 的 HTTP staging 续期验证成功，当前有效证书未被 staging 证书替换。systemd timer 已启用并产生一次实际检查记录。

未验证真实 iPhone、跨浏览器、系统重启后的实际恢复，以及未来到期时的真实续签。本轮不提交 `ios/` 与只描述 iOS 的设计记录；这些改动保留在本地。
