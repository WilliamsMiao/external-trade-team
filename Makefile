# ===========================================
# Makefile - 外部贸易团队
# ===========================================

.PHONY: help setup config start stop ps logs health backup test test-minimax test-hr test-e2e clean

# 默认目标
help:
	@echo "外部贸易团队 - 可用命令"
	@echo ""
	@echo "setup        - 初始化环境 (首次运行)"
	@echo "config       - 配置API密钥"
	@echo "start        - 启动所有服务"
	@echo "stop         - 停止所有服务"
	@echo "ps           - 查看服务状态"
	@echo "logs         - 查看日志"
	@echo "health       - 健康检查"
	@echo "backup       - 备份数据"
	@echo "test         - 运行所有测试"
	@echo "test-minimax - 测试MiniMax API"
	@echo "test-hr      - 测试HR流程"
	@echo "test-e2e     - 端到端测试"
	@echo "clean        - 清理容器和数据"

# 首次初始化
setup:
	@echo "运行初始化脚本..."
	./scripts/setup_minimax.sh

# 配置API
config:
	@echo "配置API密钥..."
	node scripts/setup.js

# 启动
start:
	@echo "启动服务..."
	./scripts/start.sh

# 停止
stop:
	@echo "停止服务..."
	docker compose down || docker-compose down

# 状态
ps:
	docker compose ps || docker-compose ps

# 日志
logs:
	docker compose logs -f || docker-compose logs -f

# 健康检查
health:
	./scripts/health_check.sh

# 备份
backup:
	./scripts/backup.sh

# 测试
test: test-minimax test-hr test-e2e
	@echo "所有测试完成!"

# MiniMax测试
test-minimax:
	@echo "测试MiniMax API..."
	./scripts/test_minimax.sh

# HR流程测试
test-hr:
	@echo "测试HR流程..."
	./scripts/test_hr_flow.sh

# 端到端测试
test-e2e:
	@echo "运行端到端测试..."
	./scripts/e2e_test.sh

# 清理
clean:
	@echo "清理容器和数据..."
	docker compose down -v || docker-compose down -v
	rm -rf workspace/*.json workspace/*.txt
	@echo "清理完成!"
