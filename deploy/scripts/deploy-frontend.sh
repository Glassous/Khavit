#!/usr/bin/env bash
# 构建前端并发布到 Nginx 站点目录，用软链做原子切换，失败可秒回滚。
# 用法：bash deploy/scripts/deploy-frontend.sh
set -euo pipefail

cd "$(dirname "$0")/../.." || exit 1

SITE_DIR="${FRONTEND_SITE_DIR:-/var/www/mail}"
STAMP="$(date +%Y%m%d-%H%M%S)"
RELEASE_DIR="${SITE_DIR}/releases/${STAMP}"

echo "==> 安装依赖（有 lock 文件时用 npm ci）"
cd frontend
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

echo "==> 构建静态产物"
npm run build

if [ ! -f dist/index.html ]; then
  echo "错误：dist/index.html 不存在，构建可能失败" >&2
  exit 1
fi

echo "==> 发布到 ${RELEASE_DIR}"
sudo mkdir -p "${RELEASE_DIR}"
sudo cp -r dist/. "${RELEASE_DIR}/"
sudo chown -R www-data:www-data "${RELEASE_DIR}" 2>/dev/null || true

echo "==> 原子切换软链 ${SITE_DIR}/current"
sudo ln -sfn "${RELEASE_DIR}" "${SITE_DIR}/current.new"
sudo mv -Tf "${SITE_DIR}/current.new" "${SITE_DIR}/current"

echo "==> 校验 Nginx 配置并重载"
sudo nginx -t
sudo systemctl reload nginx

echo "==> 清理旧版本，只保留最近 5 个"
ls -1dt "${SITE_DIR}"/releases/*/ 2>/dev/null | tail -n +6 | while read -r old; do
  echo "    删除 ${old}"
  sudo rm -rf "${old}"
done

echo "==> 部署完成：https://${FRONTEND_DOMAIN:-mail.example.com}/"
