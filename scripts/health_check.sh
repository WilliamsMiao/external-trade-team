#!/bin/bash
# ===========================================
# 健康检查脚本 - health_check.sh
# 检查所有服务状态
# ===========================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo "==========================================="
echo "外部贸易团队 - 健康检查"
echo "==========================================="

# 确定 docker-compose 命令
if command -v docker-compose &> /dev/null; then
    DC="docker-compose"
else
    DC="docker compose"
fi

# 1. Docker 服务状态
echo ""
echo "[1/4] Docker 服务状态:"
echo ""
$DC ps

# 2. PostgreSQL
echo ""
echo "[2/4] PostgreSQL 检查:"
if $DC exec -T postgres pg_isready -U openclaw &> /dev/null; then
    echo "  ✅ PostgreSQL 运行正常"
else
    echo "  ❌ PostgreSQL 未就绪"
fi

# 3. Redis
echo ""
echo "[3/4] Redis 检查:"
if $DC exec -T redis redis-cli ping &> /dev/null; then
    echo "  ✅ Redis 运行正常"
else
    echo "  ❌ Redis 未就绪"
fi

# 4. Gateway 健康检查
echo ""
echo "[4/4] OpenClaw Gateway 检查:"
GATEWAY_URL="http://localhost:18789/health"
if curl -sf "$GATEWAY_URL" &> /dev/null; then
    echo "  ✅ Gateway 运行正常"
    curl -s "$GATEWAY_URL" | head -5
else
    echo "  ❌ Gateway 未响应 (可能还在启动)"
fi

echo ""
echo "==========================================="
echo "检查完成 $(date '+%Y-%m-%d %H:%M:%S')"
echo "==========================================="
