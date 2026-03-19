#!/bin/bash
# ===========================================
# 初始化脚本 - setup_minimax.sh
# 检查依赖并创建目录结构
# ===========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "==========================================="
echo "外部贸易团队 - 初始化脚本"
echo "==========================================="

# 检查 Docker
echo ""
echo "[1/4] 检查 Docker..."
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装，请先安装 Docker Desktop"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo "❌ Docker 未运行，请启动 Docker Desktop"
    exit 1
fi
echo "✅ Docker 已就绪"

# 检查 Docker Compose
echo ""
echo "[2/4] 检查 Docker Compose..."
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose 未安装"
    exit 1
fi
echo "✅ Docker Compose 已就绪"

# 创建必要目录
echo ""
echo "[3/4] 创建目录结构..."
cd "$PROJECT_ROOT"

for dir in workspace logs data/clients data/orders data/suppliers backups; do
    if [ ! -d "$dir" ]; then
        mkdir -p "$dir"
        echo "  ✅ 创建 $dir/"
    fi
done

# 检查 .env
echo ""
echo "[4/4] 检查环境变量..."
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "✅ 已复制 .env.example 为 .env"
        echo ""
        echo "⚠️  请编辑 .env 文件填入真实配置!"
        echo "   特别是:"
        echo "   - DB_PASSWORD"
        echo "   - MINIMAX_API_KEY"
        echo "   - PGADMIN_PASSWORD"
    else
        echo "❌ .env.example 不存在"
        exit 1
    fi
else
    echo "✅ .env 已存在"
fi

echo ""
echo "==========================================="
echo "✅ 初始化完成!"
echo "==========================================="
echo ""
echo "下一步:"
echo "  1. 编辑 .env 填入真实配置"
echo "  2. 运行 ./scripts/start.sh 启动服务"
echo ""
