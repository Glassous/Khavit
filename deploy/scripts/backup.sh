#!/usr/bin/env bash
# 冷备 Stalwart 数据。RocksDB 是单进程独占，必须先停容器再复制，否则备份不可用。
set -euo pipefail

cd "$(dirname "$0")/../.." || exit 1

BACKUP_DIR="${BACKUP_DIR:-backups}"
KEEP="${KEEP:-7}"
STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="${BACKUP_DIR}/postal-${STAMP}.tar.gz"

mkdir -p "${BACKUP_DIR}"

# 防止并发备份互相踩踏
exec 9>"${BACKUP_DIR}/.backup.lock"
if ! flock -n 9; then
  echo "错误：已有备份任务在运行" >&2
  exit 1
fi

if [ ! -d data/etc ] || [ ! -d data/lib ]; then
  echo "错误：找不到 data/etc 或 data/lib，请先启动过一次后端" >&2
  exit 1
fi

echo "==> 停止 Stalwart（保证 RocksDB 一致）"
docker compose stop stalwart

restore_service() {
  echo "==> 重新启动 Stalwart"
  docker compose start stalwart
}
trap restore_service EXIT

echo "==> 打包 data/etc 与 data/lib 到 ${ARCHIVE}"
tar -czf "${ARCHIVE}" data/etc data/lib

if [ ! -s "${ARCHIVE}" ]; then
  echo "错误：备份文件为空，放弃" >&2
  exit 1
fi

SIZE="$(du -h "${ARCHIVE}" | cut -f1)"
echo "==> 备份完成：${ARCHIVE} (${SIZE})"

echo "==> 清理旧备份，保留最近 ${KEEP} 份"
ls -1t "${BACKUP_DIR}"/postal-*.tar.gz 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r old; do
  echo "    删除 ${old}"
  rm -f "${old}"
done

echo "==> 完成"
