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
healthy=0
for _ in $(seq 1 30); do
  if curl -fsSk --max-time 3 https://127.0.0.1:8443/healthz/live >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 2
done

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
else
  echo "后端未响应 443，且不在 bootstrap 模式，最近日志：" >&2
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
