# 部署手册

## 1. 拓扑与端口

```
公网 443 ──> Nginx（宿主机）
               ├── /            前端静态 dist（/var/www/mail/current）
               ├── /jmap/       ──> 127.0.0.1:443  Stalwart
               ├── /.well-known/jmap
               ├── /autoconfig/ /autodiscover/ /.well-known/autoconfig/
               └── /.well-known/mta-sts.txt

公网 25 465 587 993 995 4190 ──> Stalwart 容器（不经 Nginx，协议层无法反代）
```

容器只把 443 与 8080 绑到回环地址，公网 443 归 Nginx。

| 端口 | 用途 | 必须公网 |
|---|---|---|
| 25 | MTA 收信/服务器间投递 | 是（否则收不到外部邮件） |
| 465 / 587 | 客户端发信 | 是 |
| 993 / 995 | IMAPS / POP3S | 是 |
| 4190 | ManageSieve | 可选 |
| 443 | Web 前端 + JMAP | 是 |
| 8080 | setup 向导 / recovery | **否**，只绑 127.0.0.1 |

## 2. 初始化（唯一一次）

```bash
cp .env.example .env && vim .env
make up
make setup      # 打印取密码与建隧道命令
```

向导中的关键选择（与容器环境强相关）：

| 步骤 | 选择 | 原因 |
|---|---|---|
| Server hostname | `mail.example.com` | 必须与 DNS、证书、Nginx `proxy_ssl_name` 三者一致，否则报 `Client metadata documents are disabled` |
| Default domain | `example.com` | 主域 |
| Data store | RocksDB（默认路径 `/var/lib/stalwart/`） | 2G 内存单机最优，见 `memory-tuning.md` |
| Directory | Internal | 账号存本地 |
| **Log / tracer** | **Console（对应 `@type: "Stdout"`）** | 容器内没有 `/var/log/stalwart/`，选文件日志会导致 `docker logs` 无输出（实测踩过） |
| DNS 管理 | Manual（或填 Cloudflare 等 API） | 决定 `dnsZoneFile` 是否自动下发 |
| TLS 证书 | ACME 自动（有 DNS API 时）/ 手动 | 见第 4 节 |

向导最后会显示 `admin@example.com` + 随机密码，**只显示一次**。写盘后必须 `make restart` 才生效。

### 如果 /admin 打不开（实测常见）

首次启动会去 GitHub 下载 WebUI 包（`https://github.com/stalwartlabs/webui/releases/download/v2/webui.zip`），网络受限时日志报：

```
Resource error ... Failed to fetch ... webui.zip
Failed to unpack application for prefixes: admin, account, no bundle is available to serve
```

此时 `/admin` 会 404，但 **JMAP API 与邮件服务完全不受影响**。三种处理方式：

1. 服务器能出网时，等下次启动自动重试（或临时给容器配 HTTP 代理）；
2. 本地下载 `webui.zip` 后解包到容器内的应用目录再重启；
3. 用 CLI/管理 API 完成配置（本方案的自研前端 + `tools/jmap-probe` 就够用，不依赖 WebUI）。

## 3. Nginx

```bash
sudo cp deploy/nginx/stalwart-proxy.conf /etc/nginx/snippets/
sudo cp deploy/nginx/mail.example.com.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/mail.example.com.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

反代片段里三行是硬性要求，缺一个就会 4xx：

```nginx
proxy_set_header Host mail.example.com;   # 必须与 Stalwart 的 hostname 一致
proxy_ssl_server_name on;
proxy_ssl_name mail.example.com;          # SNI 与证书校验名
```

**不要反代 `/admin` 与 `/account`**：前端自己占了 `/admin` 路由，且 Stalwart 自带 WebUI 不应暴露公网。需要时用 SSH 隧道：

```bash
ssh -L 8443:127.0.0.1:443 user@server
# 浏览器打开 https://127.0.0.1:8443/admin
```

## 4. TLS 证书

邮件协议（993/465/587）必须有**受信任证书**，否则邮件客户端直接报错。两条路线：

### 方案 A：Stalwart 自带 ACME（推荐，需 DNS API）

向导里勾选自动证书，DNS 提供商选 Cloudflare / Route53 / 阿里云等，填 API Token。
自动续期、自动 reload，Nginx 侧可复用同一份证书文件（挂载 `/opt/certs`），或由 Nginx 单独用 certbot。

优点：邮件端口与 Web 用同一套证书，无人工介入。

### 方案 B：certbot HTTP-01（无 DNS API 时）

```bash
sudo certbot certonly --webroot -w /var/www/certbot -d mail.example.com
```

然后让 Stalwart 用同一份证书：把 `/etc/letsencrypt` 以只读方式挂进容器（`docker-compose.yml` 里 `./data/certs:/opt/certs:ro` 已预留位置），在管理后台 `Management › Certificates` 新增 Manual 证书，指向容器内路径。

续期钩子必须同时重载两端：

```bash
# /etc/letsencrypt/renewal-hooks/deploy/mail.sh
#!/usr/bin/env bash
systemctl reload nginx
docker compose -f /opt/postal/docker-compose.yml restart stalwart
```

`make certs` 就是这两条命令。

> 实测：`requestTlsCertificate: false` 时启动日志会出现 `WARN No TLS certificates available (tls.no-certificates-available) total = 0`，此时 443 仍以自签证书响应（浏览器会警告，邮件客户端会拒绝）。生产必须配好证书。

## 5. 前端发布

前端**不进容器、不进镜像**：

```bash
make frontend-build     # 产物在 frontend/dist
make frontend-deploy    # 构建 + 拷贝到 /var/www/mail/releases/<时间戳> + 软链切换
```

`deploy-frontend.sh` 的发布策略：

- 每次发布生成独立目录 `releases/20261107-153000`
- `current` 软链原子切换（`ln -sfn` + `mv -Tf`）
- 保留最近 5 个版本，回滚只需把 `current` 指回上一版：

```bash
sudo ln -sfn /var/www/mail/releases/<上一个时间戳> /var/www/mail/current.new
sudo mv -Tf /var/www/mail/current.new /var/www/mail/current
sudo systemctl reload nginx
```

前端与后端完全解耦：只改 UI 可以独立发版、独立回滚，不需要重启容器。

## 6. 备份与恢复

RocksDB 是单进程独占，**必须冷备**：

```bash
make backup                                     # 停容器 → tar data/etc + data/lib → 起容器，保留 7 份
make restore ARCHIVE=backups/postal-20261107-030000.tar.gz
```

恢复会先把当前数据挪到 `data/rollback-<时间戳>`，出问题可直接搬回。

建议加一条 crontab：

```cron
0 3 * * * cd /opt/postal && KEEP=7 make backup >> backups/cron.log 2>&1
```

## 7. 升级

```bash
make backup                 # 1. 冷备
docker compose pull         # 2. 拉新镜像（默认 tag v1，跟 1.x 小版本）
docker compose up -d        # 3. 重建容器
curl -fsSk https://127.0.0.1:443/healthz/live && echo OK   # 4. 健康检查
```

回滚：把 `STALWART_TAG` 改回上一个具体版本（如 `v1.0.3`），`docker compose up -d`，必要时 `make restore`。

**不要跨大版本直接升**（v0.16 → v1 移除了旧 REST 管理 API，配置结构也变），跨大版本前先看 Release Notes 并在测试机演练。

## 8. 排障速查

| 现象 | 原因 | 处理 |
|---|---|---|
| `docker logs` 没有运行日志 | tracer 是 `Log` 写 `/var/log/stalwart/` | 改为 `Stdout`，见 `jmap-contract.md` 第 10 节 |
| `/admin` 404 | WebUI bundle 下载失败 | 见第 2 节；不影响 JMAP |
| 登录报 `Unknown client id` | 用 8080 明文访问 WebUI | 用 443 / SSH 隧道 |
| 报 `Client metadata documents are disabled` | 用 IP 或与 hostname 不符的域名访问 | 统一用 `https://mail.example.com` |
| 容器 unhealthy | 改了 443 端口或移除 8080 但没改健康检查地址 | 设置 `STALWART_HEALTHCHECK_URL` |
| 邮件发出但对方收不到 | 出站 25 被封 / PTR 未设 / SPF-DKIM 不匹配 | 见 `dns-and-deliverability.md` |
| 队列积压 | 同上，或对端拒收 | 看 `docker compose logs` 里的 `queue` 事件 |

## 9. 安全清单

- [ ] 8080 只绑 `127.0.0.1`，setup 完成后 `STALWART_RECOVERY_ADMIN` 清空并重启
- [ ] `data/` 权限 700，备份文件不入版本库（`.gitignore` 已排除）
- [ ] 管理员账号开 2FA（若版本支持）或使用强密码短语
- [ ] Nginx 已加 HSTS / CSP / `X-Frame-Options`
- [ ] 前端凭据只存 `sessionStorage`，不写 `localStorage`
- [ ] 不给 `allowRelaying` 打开（开放中继会被滥用）
