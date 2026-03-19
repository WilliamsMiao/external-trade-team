# ===========================================
# Makefile - 外部贸易团队
# ===========================================

.PHONY: help setup config start stop ps logs health status watch report briefing dashboard ask demo backup test test-minimax test-hr test-e2e test-selection-real test-acquisition-real test-real clean

COMPOSE_FILE := docker-compose-dev.yml
DC := docker compose -f $(COMPOSE_FILE)

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
	@echo "status       - 查看运行态(Agent/任务/动作)"
	@echo "watch        - 实时监控运行态"
	@echo "report       - 自然语言团队工作报告"
	@echo "briefing     - 清晰版团队简报"
	@echo "dashboard    - 管理者业务驾驶舱（商机/转化/成交）"
	@echo "ask          - 与单个Agent交互 (AGENT=sales MSG='...')"
	@echo "demo         - 触发一条演示工作流"
	@echo "backup       - 备份数据"
	@echo "test         - 运行所有测试"
	@echo "test-minimax - 测试MiniMax API"
	@echo "test-hr      - 测试HR流程"
	@echo "test-e2e     - 端到端测试"
	@echo "test-selection-real   - 选品Agent真实互联网测试"
	@echo "test-acquisition-real - 获客Agent真实互联网测试"
	@echo "test-real    - 运行两项真实互联网Agent测试"
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
	$(DC) down

# 状态
ps:
	$(DC) ps

# 日志
logs:
	$(DC) logs -f

# 健康检查
health:
	./scripts/health_check.sh

# 运行态
status:
	./scripts/runtime_status.sh

# 实时监控
watch:
	./scripts/watch_status.sh

# 自然语言团队报告
report:
	node ./scripts/team_report.js

# 清晰版团队简报
briefing:
	node ./scripts/agent_console.js briefing

# 管理者驾驶舱
dashboard:
	node ./scripts/manager_dashboard.js 8

# 与单个Agent交互
ask:
	@if [ -z "$(AGENT)" ] || [ -z "$(MSG)" ]; then \
		echo "用法: make ask AGENT=selection MSG='我要找德国市场高利润电子配件'"; \
		echo "可选AGENT: coordinator/hr/sales/acquisition/selection/supply/ops/finance"; \
		exit 1; \
	fi
	node ./scripts/agent_console.js $(AGENT) "$(MSG)"

# 触发演示工作流
demo:
	curl -s -X POST http://localhost:18789/workflow/demo \
	  -H "Content-Type: application/json" \
	  -d '{"inquiryText":"客户 XYZ Import 询价 300 件 sensor，预算 $$9000，15 天内交付到 Germany","customerEmail":"procurement@xyzimport.com","priority":"high"}'

# 备份
backup:
	./scripts/backup.sh

# 测试
test: test-minimax test-hr test-e2e
	@echo "所有测试完成!"

# 真实互联网测试集合
test-real: test-selection-real test-acquisition-real
	@echo "真实互联网Agent测试完成!"

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

# Selection Agent 真实互联网测试
test-selection-real:
	@echo "运行 Selection Agent 真实互联网测试..."
	node ./scripts/test_selection_real.js

# Acquisition Agent 真实互联网测试
test-acquisition-real:
	@echo "运行 Acquisition Agent 真实互联网测试..."
	node ./scripts/test_acquisition_real.js

# 清理
clean:
	@echo "清理容器和数据..."
	$(DC) down -v
	rm -rf workspace/*.json workspace/*.txt
	@echo "清理完成!"
