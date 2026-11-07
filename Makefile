# 自建邮局 —— 常用操作入口
# 用法：make help
# 注意：脚本统一用 bash 调用，避免 Windows 换行导致的 shebang 失效

SHELL := /bin/bash
COMPOSE := docker compose

.DEFAULT_GOAL := help

.PHONY: help up down restart logs ps setup backup restore certs reload probe \
        frontend-install frontend-dev frontend-build frontend-deploy check

help: ## 显示所有可用目标
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

up: ## 拉起后端容器
	$(COMPOSE) up -d
	@echo "后端已启动，等待健康检查：$(COMPOSE) ps"

down: ## 停止并移除后端容器（数据保留在 ./data）
	$(COMPOSE) down

restart: ## 重启后端（修改 config.json 或证书后使用）
	$(COMPOSE) restart

logs: ## 跟踪后端日志
	$(COMPOSE) logs -f --tail=200 stalwart

ps: ## 查看容器状态与健康检查
	$(COMPOSE) ps

setup: ## 打印首次初始化步骤与临时管理员口令
	@echo "1) 若还没启动，先执行 make up"
	@echo "2) 从日志里取临时 admin 口令："
	@echo "   $(COMPOSE) logs stalwart 2>&1 | grep -A8 'bootstrap mode'"
	@echo "3) 建 SSH 隧道后访问向导：ssh -L 8080:127.0.0.1:8080 <user>@<server>"
	@echo "   浏览器打开 http://127.0.0.1:8080/admin"
	@echo "4) 向导第 4 屏日志目标必须选 Console（容器内没有 /var/log/stalwart）"
	@echo "5) 向导写盘后执行 make restart 才生效"

backup: ## 冷备数据（会短暂停止容器）
	bash deploy/scripts/backup.sh

restore: ## 从备份恢复，用法：make restore ARCHIVE=backups/postal-20260101-030000.tar.gz
	bash deploy/scripts/restore.sh $(ARCHIVE)

certs: ## 续期证书后重载 Nginx 与后端
	nginx -t && systemctl reload nginx
	$(COMPOSE) restart stalwart

reload: certs ## certs 的别名

probe: ## 跑 JMAP 探针，验证后端接口契约
	cd tools/jmap-probe && npm install --silent && npm run probe

frontend-install: ## 安装前端依赖
	cd frontend && npm install

frontend-dev: ## 本地开发前端（Vite dev server）
	cd frontend && npm run dev

frontend-build: ## 构建前端静态产物
	cd frontend && npm run build

frontend-deploy: ## 构建并发布到 Nginx 站点目录（原子软链切换）
	bash deploy/scripts/deploy-frontend.sh

check: ## 部署前自检：compose 语法 + 端口占用
	$(COMPOSE) config --quiet && echo "compose 语法 OK"
	@echo "以下端口需在防火墙放行：25 465 587 993 995 4190 443"
