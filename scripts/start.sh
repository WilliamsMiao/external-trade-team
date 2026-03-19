#!/bin/bash
# ===========================================
# 启动脚本 - start.sh
# 启动所有服务
# ===========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

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

# 检查必要的环境变量
source .env
MISSING_VARS=""
[ -z "$DB_PASSWORD" ] || [ "$DB_PASSWORD" = "change_me" ] && MISSING_VARS="$MISSING_VARS DB_PASSWORD"
[ -z "$MINIMAX_API_KEY" ] || [ "$MINIMAX_API_KEY" = "sk-your-minimax-key" ] && MISSING_VARS="$MISSING_VARS MINIMAX_API_KEY"

if [ -n "$MISSING_VARS" ]; then
    echo "⚠️  以下变量未配置: $MISSING_VARS"
    echo "   请编辑 .env 后再启动"
fi
echo "✅ .env 已就绪"

# 确定 docker-compose 命令
if command -v docker-compose &> /dev/null; then
    DC="docker-compose"
else
    DC="docker compose"
fi

# 停止旧服务
echo ""
echo "[3/5] 停止旧服务..."
$DC down 2>/dev/null || true

# 启动服务
echo ""
echo "[4/5] 启动 Docker 服务..."
$DC up -d

# 等待启动
echo ""
echo "[5/5] 等待服务就绪..."
sleep 15

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

echo ""
echo "==========================================="
echo "✅ 启动完成!"
echo "==========================================="
echo ""
echo "访问地址:"
echo "  - OpenClaw Gateway: http://localhost:18789"
echo "  - PgAdmin: http://localhost:5050"
echo "  - PostgreSQL: localhost:5432"
echo "  - Redis: localhost:6379"
echo ""
echo "后续步骤:"
echo "  1. 配置 MiniMax API Key 到 .env"
echo "  2. 运行 ./scripts/test_minimax.sh 测试API"
echo "  3. 查看 ./scripts/health_check.sh"
echo ""
