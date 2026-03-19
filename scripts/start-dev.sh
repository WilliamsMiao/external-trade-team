#!/bin/bash
# ===========================================
# 启动脚本 - 本地开发版本 (start-dev.sh)
# 使用开源镜像，无需 OpenClaw 专有镜像
# ===========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "==========================================="
echo "外部贸易团队 - 启动服务 (开发模式)"
echo "==========================================="

cd "$PROJECT_ROOT"

# 检查 Docker
echo ""
echo "[1/4] 检查 Docker..."
if ! docker info &> /dev/null; then
    echo "❌ Docker 未运行，请启动 Docker Desktop"
    exit 1
fi
echo "✅ Docker 已运行"

# 检查 .env
echo ""
echo "[2/4] 检查环境变量..."
if [ ! -f ".env" ]; then
    echo "❌ .env 文件不存在"
    exit 1
fi

# 检查必要的环境变量
source .env
if [ -z "$DB_PASSWORD" ] || [ "$DB_PASSWORD" = "change_me" ]; then
    echo "⚠️  DB_PASSWORD 未配置"
    exit 1
fi
if [ -z "$MINIMAX_API_KEY" ] || [ "$MINIMAX_API_KEY" = "sk-your-minimax-key" ]; then
    echo "⚠️  MINIMAX_API_KEY 未配置"
    exit 1
fi
echo "✅ .env 已就绪"

# 停止旧服务
echo ""
echo "[3/4] 停止旧服务..."
docker compose -f docker-compose-dev.yml down 2>/dev/null || true
echo "✅ 已清理旧容器"

# 启动新服务
echo ""
echo "[4/4] 启动 Docker 服务..."
echo "使用配置: docker-compose-dev.yml"
echo ""

docker compose -f docker-compose-dev.yml up -d

# 等待服务启动
echo ""
echo "等待服务启动... (最多 30 秒)"
sleep 5

# 检查 PostgreSQL
echo ""
echo "[检查] PostgreSQL 连接..."
for i in {1..6}; do
    if docker compose -f docker-compose-dev.yml exec -T postgres pg_isready -U openclaw -d openclaw_trade 2>/dev/null; then
        echo "✅ PostgreSQL 已就绪"
        break
    fi
    if [ $i -eq 6 ]; then
        echo "⚠️  PostgreSQL 启动较慢，请稍后再检查"
    else
        echo "  等待 PostgreSQL... ($i/6)"
        sleep 5
    fi
done

# 检查 Redis
echo ""
echo "[检查] Redis 连接..."
if docker compose -f docker-compose-dev.yml exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
    echo "✅ Redis 已就绪"
else
    echo "⚠️  Redis 启动较慢，请稍后再检查"
fi

# 显示容器状态
echo ""
echo "==========================================="
echo "容器状态:"
echo "==========================================="
docker compose -f docker-compose-dev.yml ps

echo ""
echo "==========================================="
echo "✅ 启动完成!"
echo "==========================================="
echo ""
echo "可访问的服务:"
echo "  • 应用程序: http://localhost:18789"
echo "  • PgAdmin: http://localhost:5050"
echo "  • PostgreSQL: localhost:5432"
echo "  • Redis: localhost:6379"
echo ""
echo "查看日志:"
echo "  docker compose -f docker-compose-dev.yml logs -f"
echo ""
echo "停止服务:"
echo "  docker compose -f docker-compose-dev.yml down"
echo ""
