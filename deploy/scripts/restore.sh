#!/usr/bin/env bash
# 从备份恢复。用法：bash deploy/scripts/restore.sh backups/postal-20260101-030000.tar.gz
set -euo pipefail

cd "$(dirname "$0")/../.." || exit 1

ARCHIVE="${1:-}"
if [ -z "${ARCHIVE}" ]; then
  echo "用法：bash deploy/scripts/restore.sh <备份文件>" >&2
  exit 1
fi
if [ ! -f "${ARCHIVE}" ]; then
  echo "错误：备份文件不存在：${ARCHIVE}" >&2
  exit 1
fi

echo "==> 校验归档完整性"
tar -tzf "${ARCHIVE}" > /dev/null

echo "即将用 ${ARCHIVE} 覆盖 data/etc 与 data/lib。"
echo "当前数据会先被移动到 data/rollback-<时间戳> 作为后悔药。"
read -r -p "输入 yes 继续：" CONFIRM
if [ "${CONFIRM}" != "yes" ]; then
  echo "已取消"
  exit 0
fi

STAMP="$(date +%Y%m%d-%H%M%S)"

echo "==> 停止 Stalwart"
docker compose stop stalwart

if [ -d data ]; then
  echo "==> 归档当前数据到 data/rollback-${STAMP}"
  mkdir -p "data/rollback-${STAMP}"
  [ -d data/etc ] && mv data/etc "data/rollback-${STAMP}/etc"
  [ -d data/lib ] && mv data/lib "data/rollback-${STAMP}/lib"
fi

echo "==> 解包备份"
tar -xzf "${ARCHIVE}"

echo "==> 启动 Stalwart"
docker compose start stalwart

echo "==> 恢复完成。若启动异常，把 data/rollback-${STAMP} 里的目录挪回 data/ 即可回滚。"
