#!/usr/bin/env bash
# 服务器端部署脚本：由 .github/workflows/deploy.yml 经 ssh-action 上传后执行
# 用法：bash deploy/scripts/remote-deploy.sh（依赖 /tmp/khavit-upload 下的上传产物）
#
# 为什么逻辑放在文件里，而不是直接写在 workflow 的 script 里：
#   drone-ssh 传输内联脚本时会破坏内容（曾实测：heredoc 缩进被剥、长脚本静默失败），
#   从磁盘执行可以完全绕开传输层；bash 报错也会完整出现在 Actions 日志里。

set -euo pipefail

# ---- 环境变量由 workflow 通过 ssh-action 的 envs 注入 ----
: "${TCR_REGISTRY:?TCR_REGISTRY 未设置}"
: "${TCR_NAMESPACE:?TCR_NAMESPACE 未设置}"
: "${TCR_USERNAME:?TCR_USERNAME 未设置}"
: "${TCR_PASSWORD:?TCR_PASSWORD 未设置}"
: "${IMAGE_ID:?IMAGE_ID 未设置}"
: "${IMAGE_TAG:?IMAGE_TAG 未设置}"
: "${APP_DIR:?APP_DIR 未设置}"
: "${SITE_INDEX_DIR:?SITE_INDEX_DIR 未设置}"

UPLOAD_DIR=/tmp/khavit-upload
REMOTE_REF="${TCR_REGISTRY}/${TCR_NAMESPACE}/stalwart:${IMAGE_TAG}"
LOCAL_REF="stalwartlabs/stalwart:${IMAGE_TAG}"

echo "=== [1/5] 镜像 ${REMOTE_REF} ==="
mkdir -p "$APP_DIR"
if [ -f "$APP_DIR/.image-id" ] \
   && [ "$(cat "$APP_DIR/.image-id")" = "$IMAGE_ID" ] \
   && docker image inspect "$LOCAL_REF" >/dev/null 2>&1; then
  echo "镜像未变化，跳过拉取"
else
  echo "$TCR_PASSWORD" | docker login "$TCR_REGISTRY" -u "$TCR_USERNAME" --password-stdin
  docker pull "$REMOTE_REF"
  docker tag "$REMOTE_REF" "$LOCAL_REF"
  docker logout "$TCR_REGISTRY" >/dev/null 2>&1 || true
  printf '%s' "$IMAGE_ID" > "$APP_DIR/.image-id"
fi

echo "=== [2/5] compose ==="
cp "$UPLOAD_DIR/docker-compose.yml" "$APP_DIR/docker-compose.yml"
cp "$UPLOAD_DIR/docker-compose.server.yml" "$APP_DIR/docker-compose.server.yml"
if [ ! -f "$APP_DIR/.env" ]; then
  echo "错误：缺少 $APP_DIR/.env（请在服务器上按 .env.example 创建，填 MAIL_HOST / MAIL_DOMAIN / ADMIN_MAIL）" >&2
  exit 1
fi
cd "$APP_DIR"
docker compose -f docker-compose.yml -f docker-compose.server.yml up -d

echo "=== [3/5] 后端健康检查 ==="
ok=0
for _ in $(seq 1 30); do
  if curl -fsSk --max-time 3 https://127.0.0.1:8443/healthz/live >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 2
done
if [ "$ok" -ne 1 ]; then
  echo "后端健康检查超时，最近日志：" >&2
  docker compose -f docker-compose.yml -f docker-compose.server.yml logs --tail=50 stalwart >&2
  exit 1
fi
echo "后端健康"

echo "=== [4/5] 前端 ==="
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

echo "=== [5/5] 清理 ==="
rm -rf "$UPLOAD_DIR"
echo "部署完成：前端在 $SITE_INDEX_DIR/dist（上一版保留在 dist.prev）"
