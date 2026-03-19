#!/bin/bash
# ===========================================
# 备份脚本 - backup.sh
# 备份数据库和重要文件
# ===========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# 加载环境变量
if [ -f ".env" ]; then
    export $(grep -v '^#' .env | xargs)
fi

# 配置
BACKUP_DIR="${BACKUP_DIR:-backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# 创建备份目录
mkdir -p "$BACKUP_DIR"

echo "==========================================="
echo "外部贸易团队 - 备份脚本"
echo "==========================================="

# 确定 docker-compose 命令
if command -v docker-compose &> /dev/null; then
    DC="docker-compose"
else
    DC="docker compose"
fi

# 1. 备份数据库
echo ""
echo "[1/3] 备份 PostgreSQL..."
DB_BACKUP="$BACKUP_DIR/postgres_${TIMESTAMP}.sql"
$DC exec -T postgres pg_dump -U openclaw openclaw_trade > "$DB_BACKUP"
echo "  ✅ 数据库已备份: $DB_BACKUP"

# 2. 打包工作文件
echo ""
echo "[2/3] 打包工作文件..."
WORK_BACKUP="$BACKUP_DIR/workspace_${TIMESTAMP}.tar.gz"
tar -czf "$WORK_BACKUP" \
    workspace/ \
    configs/ \
    agents/ \
    2>/dev/null || true
echo "  ✅ 工作文件已打包: $WORK_BACKUP"

# 3. 清理旧备份
echo ""
echo "[3/3] 清理超过 ${RETENTION_DAYS} 天的备份..."
find "$BACKUP_DIR" -name "*.sql" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete
echo "  ✅ 旧备份已清理"

# 显示结果
echo ""
echo "==========================================="
echo "✅ 备份完成!"
echo "==========================================="
echo ""
echo "本次备份:"
ls -lh "$DB_BACKUP" 2>/dev/null || true
ls -lh "$WORK_BACKUP" 2>/dev/null || true
echo ""
echo "现有备份:"
ls -lh "$BACKUP_DIR"/ 2>/dev/null || echo "  (无)"
echo ""
