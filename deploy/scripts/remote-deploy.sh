#!/usr/bin/env bash
# 服务器端部署脚本：由 .github/workflows/deploy.yml 经 ssh-action 上传后执行
# 用法：bash deploy/scripts/remote-deploy.sh（依赖 /tmp/khavit-upload 下的上传产物）
#
# 为什么逻辑放在文件里，而不是直接写在 workflow 的 script 里：
#   drone-ssh 传输内联脚本时会破坏内容（实测：heredoc 缩进被剥、长脚本静默失败），
#   从磁盘执行可以完全绕开传输层；bash 报错也会完整出现在 Actions 日志里。
#
# 注意：本脚本不搬运镜像。服务器已配置腾讯云内网镜像源（mirror.ccs.tencentyun.com），
#       镜像由服务器自己 docker pull，工作流只负责前端产物与 compose。

set -euo pipefail

: "${STALWART_TAG:?STALWART_TAG 未设置}"
: "${APP_DIR:?APP_DIR 未设置}"
: "${SITE_INDEX_DIR:?SITE_INDEX_DIR 未设置}"

UPLOAD_DIR=/tmp/khavit-upload
IMAGE_REF="stalwartlabs/stalwart:${STALWART_TAG}"

echo "=== [1/4] 检查镜像 ${IMAGE_REF} ==="
# 服务器已配置腾讯云内网镜像源（mirror.ccs.tencentyun.com），拉取走内网、不占公网带宽，
# 所以这里直接交给服务器自己拉，工作流不需要搬镜像。
if docker image inspect "$IMAGE_REF" >/dev/null 2>&1; then
  echo "本地已有镜像，尝试检查更新（失败则沿用本地）"
  docker pull "$IMAGE_REF" || echo "WARN: 拉取失败，继续使用本地镜像"
else
  echo "本地没有镜像，开始拉取"
  docker pull "$IMAGE_REF"
fi

echo "=== [2/4] compose ==="
mkdir -p "$APP_DIR"
cp "$UPLOAD_DIR/docker-compose.yml" "$APP_DIR/docker-compose.yml"
cp "$UPLOAD_DIR/docker-compose.server.yml" "$APP_DIR/docker-compose.server.yml"
if [ ! -f "$APP_DIR/.env" ]; then
  echo "错误：缺少 $APP_DIR/.env（请在服务器上按 .env.example 创建，填 MAIL_HOST / MAIL_DOMAIN / ADMIN_MAIL）" >&2
  exit 1
fi
cd "$APP_DIR"
docker compose -f docker-compose.yml -f docker-compose.server.yml up -d

echo "=== [3/4] 后端健康检查 ==="
# 这里的探测特意从宿主机走 127.0.0.1:8443，而不是只看容器状态：
# 它验证的正是「Nginx → 容器」这条真实用户通路。
healthy=0
for _ in $(seq 1 30); do
  if curl -fsSk --max-time 3 https://127.0.0.1:8443/healthz/live >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 2
done

# 容器内健康检查走容器自己的 127.0.0.1（回环地址永不被封），
# 用它区分「服务真挂了」和「宿主机到容器这条路被封了」。
container_health() {
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' stalwart 2>/dev/null || echo unknown
}

if [ "$healthy" -eq 1 ]; then
  echo "后端健康（443 正常服务）"
elif docker logs --tail 200 stalwart 2>&1 | grep -q 'bootstrap mode'; then
  # 首次部署时容器还没初始化：只监听 8080 的初始化向导，443 不服务。
  # 这不是部署失败，是一次性的人工步骤，所以这里放行并给出操作提示。
  echo "⚠️  后端处于 bootstrap 模式（尚未初始化），443 不会响应。"
  echo "   初始化只需做一次："
  echo "     1) 本机建隧道：ssh -L 18080:127.0.0.1:18080 <user>@<host>"
  echo "     2) 浏览器打开 http://127.0.0.1:18080/admin 完成向导"
  echo "     3) 完成后在服务器执行：docker compose -f docker-compose.yml -f docker-compose.server.yml restart stalwart"
  echo "   本次部署继续发布前端。"
elif docker logs --tail 200 stalwart 2>&1 | grep 'security.ip-blocked' | grep -q 'listenerId = "https"'; then
  # 端口发布（127.0.0.1:8443:443）会经过 docker-proxy，容器看到的客户端是网桥网关
  # （如 172.19.0.1），Nginx 与健康检查共用这一个源地址。auto-ban 一旦命中，
  # 该地址在所有监听器上被直接断开连接——443 表现为「无响应」，Nginx 返回 502。
  # 这是配置问题，不是容器崩了，所以不打印 200 行日志，直接给处置步骤。
  echo "✗ 宿主机 → 容器的 https 通路被 Stalwart auto-ban 掐断（容器健康状态：$(container_health)）。" >&2
  echo "  原因：反代经 docker-proxy 接入，容器看到的源地址是网桥网关，全体 Web 用户共用一个 IP，" >&2
  echo "        任何一次扫描/口令错误的计数累加都会把它整段封掉（扫描类路径首次命中即封）。" >&2
  echo "  解封（恢复模式会暂停 auto-ban，且 8080 只绑回环，最稳）：" >&2
  echo "    STALWART_RECOVERY_MODE=1 STALWART_RECOVERY_ADMIN='admin:<密码>' \\" >&2
  echo "      docker compose -f docker-compose.yml -f docker-compose.server.yml up -d stalwart" >&2
  echo "    ssh -L 18080:127.0.0.1:18080 <user>@<host> → http://127.0.0.1:18080/admin" >&2
  echo "    Settings › Security › Blocked IPs 删掉网桥网关，再 Management › Actions › ReloadBlockedIps" >&2
  echo "  根治：Nginx 传真实客户端 IP + Stalwart 开 clientIpSource=xForwardedFor，" >&2
  echo "        并把网桥网段加入 proxyTrustedNetworks，步骤见 docs/deployment.md 第 8.1 节。" >&2
  exit 1
else
  echo "后端未响应 443，且不在 bootstrap 模式（容器健康状态：$(container_health)），最近日志：" >&2
  docker compose -f docker-compose.yml -f docker-compose.server.yml logs --tail=50 stalwart >&2
  exit 1
fi

echo "=== [4/4] 前端 ==="
rm -rf "$UPLOAD_DIR/out"
mkdir -p "$UPLOAD_DIR/out"
tar -xzf "$UPLOAD_DIR/.deploy/dist.tar.gz" -C "$UPLOAD_DIR/out"
mkdir -p "$SITE_INDEX_DIR"
if [ -d "$SITE_INDEX_DIR/dist" ]; then
  rm -rf "$SITE_INDEX_DIR/dist.prev"
  mv "$SITE_INDEX_DIR/dist" "$SITE_INDEX_DIR/dist.prev"
fi
mv "$UPLOAD_DIR/out/dist" "$SITE_INDEX_DIR/dist"
chmod -R a+rX "$SITE_INDEX_DIR/dist"
rm -rf "$UPLOAD_DIR"
echo "部署完成：前端在 $SITE_INDEX_DIR/dist（上一版保留在 dist.prev）"
