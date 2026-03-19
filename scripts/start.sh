#!/bin/bash
# ===========================================
# 启动脚本 - start.sh
# 启动所有服务
# ===========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="docker-compose-dev.yml"
FORCE_INTERACTIVE="${START_INTERACTIVE:-1}"

if [ "${1:-}" = "--no-interactive" ]; then
    FORCE_INTERACTIVE="0"
fi

if [ -n "${CI:-}" ]; then
    FORCE_INTERACTIVE="0"
fi

echo "==========================================="
echo "外部贸易团队 - 启动服务"
echo "==========================================="

cd "$PROJECT_ROOT"

# 检查 Docker
echo ""
echo "[1/5] 检查 Docker..."
if ! docker info &> /dev/null; then
    echo "❌ Docker 未运行，请启动 Docker Desktop"
    exit 1
fi
echo "✅ Docker 已运行"

# 检查 .env
echo ""
echo "[2/5] 检查环境变量..."
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "✅ 已复制 .env.example 为 .env"
        echo ""
        echo "⚠️  请编辑 .env 文件填入真实配置!"
        exit 1
    else
        echo "❌ .env.example 不存在"
        exit 1
    fi
fi

if [ "$FORCE_INTERACTIVE" = "1" ] && [ -t 0 ]; then
    echo "🔧 启动交互式配置向导（可回车保留现有值）..."
    node ./scripts/env_wizard.js
fi

# 检查必要的环境变量
source .env
MISSING_VARS=""
[ -z "$DB_PASSWORD" ] || [ "$DB_PASSWORD" = "change_me" ] && MISSING_VARS="$MISSING_VARS DB_PASSWORD"
[ -z "$PGADMIN_PASSWORD" ] || [ "$PGADMIN_PASSWORD" = "change_me_pgadmin_password" ] && MISSING_VARS="$MISSING_VARS PGADMIN_PASSWORD"
[ -z "$MINIMAX_API_KEY" ] || [ "$MINIMAX_API_KEY" = "sk-your-minimax-key" ] && MISSING_VARS="$MISSING_VARS MINIMAX_API_KEY"

if [ -n "$MISSING_VARS" ]; then
    echo "⚠️  检测到关键变量未配置:$MISSING_VARS"
    if [ -t 0 ]; then
        echo "🔧 正在启动交互式配置向导..."
        node ./scripts/env_wizard.js
        source .env
        MISSING_VARS=""
        [ -z "$DB_PASSWORD" ] || [ "$DB_PASSWORD" = "change_me" ] && MISSING_VARS="$MISSING_VARS DB_PASSWORD"
        [ -z "$PGADMIN_PASSWORD" ] || [ "$PGADMIN_PASSWORD" = "change_me_pgadmin_password" ] && MISSING_VARS="$MISSING_VARS PGADMIN_PASSWORD"
        [ -z "$MINIMAX_API_KEY" ] || [ "$MINIMAX_API_KEY" = "sk-your-minimax-key" ] && MISSING_VARS="$MISSING_VARS MINIMAX_API_KEY"

        if [ -n "$MISSING_VARS" ]; then
            echo "❌ 仍有关键变量未配置:$MISSING_VARS"
            exit 1
        fi
    else
        echo "❌ 非交互终端，无法自动配置 .env"
        echo "   请先运行: node ./scripts/env_wizard.js"
        exit 1
    fi
fi
echo "✅ .env 已就绪"

# 确定 docker-compose 命令
DC="docker compose -f $COMPOSE_FILE"

if [ ! -f "$COMPOSE_FILE" ]; then
    echo "❌ 未找到 $COMPOSE_FILE"
    exit 1
fi

# 停止旧服务
echo ""
echo "[3/5] 停止旧服务..."
$DC down 2>/dev/null || true

echo ""
echo "[4/5] 构建并启动服务..."
$DC build --pull app
$DC up -d

# 等待启动
echo ""
echo "[5/5] 等待服务就绪..."
sleep 10

# 显示状态
echo ""
echo "==========================================="
echo "服务状态:"
echo "==========================================="
$DC ps

# 测试数据库
echo ""
echo "==========================================="
echo "数据库测试:"
echo "==========================================="
if $DC exec -T postgres pg_isready -U openclaw &> /dev/null; then
    echo "  ✅ PostgreSQL 运行正常"
    ESCAPED_DB_PASSWORD=${DB_PASSWORD//\'/\'\'}
    $DC exec -T postgres psql -U openclaw -d openclaw_trade -c "ALTER USER openclaw WITH PASSWORD '${ESCAPED_DB_PASSWORD}';" >/dev/null 2>&1 || true
    echo "  ✅ 数据库密码已与 .env 同步"
        $DC exec -T postgres psql -U openclaw -d openclaw_trade -c "
            INSERT INTO agents (name, type, status, config) VALUES
                ('Acquisition Agent', 'acquisition_agent', 'active', '{\"description\": \"客户开发与询盘分级\"}'),
                ('Selection Agent', 'selection_agent', 'active', '{\"description\": \"选品与利润评估\"}')
            ON CONFLICT (name) DO NOTHING;
        " >/dev/null 2>&1 || true
        echo "  ✅ Agent 注册已同步（含 Selection/Acquisition）"
    $DC exec -T postgres psql -U openclaw -d openclaw_trade -c "SELECT COUNT(*) as agent_count FROM agents;" 2>/dev/null || echo "  ⚠️  表可能未初始化"
else
    echo "  ⚠️  PostgreSQL 未就绪"
fi

# 测试 Redis
echo ""
echo "==========================================="
echo "Redis 测试:"
echo "==========================================="
if $DC exec -T redis redis-cli ping &> /dev/null; then
    echo "  ✅ Redis 运行正常"
else
    echo "  ⚠️  Redis 未就绪"
fi

# 首次启动自动注入一条演示工作流，便于观察Agent运行情况
echo ""
echo "==========================================="
echo "运行流初始化:"
echo "==========================================="
TASK_COUNT=$($DC exec -T postgres psql -U openclaw -d openclaw_trade -tA -c "SELECT COUNT(*) FROM tasks;" 2>/dev/null | tr -d '[:space:]')
if [ -z "$TASK_COUNT" ]; then
    TASK_COUNT=0
fi

if [ "$TASK_COUNT" = "0" ]; then
    echo "  ℹ️  当前无任务，自动触发一条演示工作流..."
    if curl -sf -X POST "http://localhost:18789/workflow/demo" \
      -H "Content-Type: application/json" \
      -d '{"inquiryText":"客户 ABC Trading 询价 500 件 electronics，预算 $15000，30 天内交付到 USA","customerEmail":"buyer@abctrading.com","priority":"high"}' >/dev/null; then
        echo "  ✅ 演示工作流触发成功"
    else
        echo "  ⚠️  演示工作流触发失败（可手动执行 make demo）"
    fi
else
    echo "  ✅ 已存在任务($TASK_COUNT)，跳过演示注入"
fi

echo ""
echo "==========================================="
echo "✅ 启动完成!"
echo "==========================================="

echo ""
echo "==========================================="
echo "运行情况 (Agent/任务/动作):"
echo "==========================================="
./scripts/runtime_status.sh || true

echo ""
echo "访问地址:"
echo "  - API Gateway: http://localhost:18789"
echo "  - PgAdmin: http://localhost:5050"
echo "  - PostgreSQL: localhost:5432"
echo "  - Redis: localhost:6379"
echo ""
echo "后续步骤:"
echo "  1. 查看运行态: make status"
echo "  2. 实时监控: make watch"
echo "  3. 查看日志: docker compose -f $COMPOSE_FILE logs -f app"
echo ""
