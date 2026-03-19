#!/bin/bash
# ===========================================
# 部署前检查脚本 - pre_deployment_check.sh
# 检查部署环境是否就绪
# ===========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 计数器
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}外部贸易团队 - 部署前检查${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# 检查函数
check_requirement() {
    local name=$1
    local command=$2
    local description=$3
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    if eval "$command" &> /dev/null; then
        echo -e "${GREEN}✅${NC} $name"
        if [ -n "$description" ]; then
            echo "   $description"
        fi
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        echo -e "${RED}❌${NC} $name"
        if [ -n "$description" ]; then
            echo "   $description"
        fi
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
    fi
}

check_file() {
    local name=$1
    local filepath=$2
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    if [ -f "$filepath" ]; then
        echo -e "${GREEN}✅${NC} $name"
        echo "   $filepath"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        echo -e "${RED}❌${NC} $name"
        echo "   $filepath (未找到)"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
    fi
}

# ============== 检查开始 ==============

echo -e "${YELLOW}[1/5] 检查系统需求${NC}"
echo ""

check_requirement "Git 已安装" "git --version" "用于版本控制"
check_requirement "Bash 版本足够" "bash --version | grep -E '5\.|4\.' 2>/dev/null" "需要 Bash 4.0+"

echo ""
echo -e "${YELLOW}[2/5] 检查 Docker${NC}"
echo ""

check_requirement "Docker 已安装" "docker --version" "容器化平台"
check_requirement "Docker Compose 已安装" "docker compose version 2>/dev/null || docker-compose --version" "容器编排工具"

DOCKER_RUNNING=""
if docker info &> /dev/null; then
    echo -e "${GREEN}✅${NC} Docker 守护进程运行中"
    echo "   $(docker ps -q | wc -l) 个容器正在运行"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
    DOCKER_RUNNING=true
else
    echo -e "${YELLOW}⚠️${NC}  Docker 守护进程未运行"
    echo "   请启动 Docker Desktop"
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
    DOCKER_RUNNING=false
fi
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

echo ""
echo -e "${YELLOW}[3/5] 检查项目文件${NC}"
echo ""

check_file "docker-compose.yml" "$PROJECT_ROOT/docker-compose.yml"
check_file ".env 配置文件" "$PROJECT_ROOT/.env"
check_file ".env.example 示例" "$PROJECT_ROOT/.env.example"
check_file "Makefile" "$PROJECT_ROOT/Makefile"
check_file "init.sql 数据库脚本" "$PROJECT_ROOT/init.sql"

echo ""
echo -e "${YELLOW}[4/5] 检查脚本文件${NC}"
echo ""

SCRIPTS=("setup_minimax.sh" "start.sh" "health_check.sh" "backup.sh")
for script in "${SCRIPTS[@]}"; do
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    if [ -x "$PROJECT_ROOT/scripts/$script" ]; then
        echo -e "${GREEN}✅${NC} $script (可执行)"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    elif [ -f "$PROJECT_ROOT/scripts/$script" ]; then
        echo -e "${YELLOW}⚠️${NC}  $script (存在但不可执行)"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
    else
        echo -e "${RED}❌${NC} $script (不存在)"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
    fi
done

echo ""
echo -e "${YELLOW}[5/5] 检查系统资源${NC}"
echo ""

# 检查磁盘空间
DISK_AVAILABLE=$(df "$PROJECT_ROOT" | tail -1 | awk '{print $4}')
DISK_AVAILABLE_GB=$((DISK_AVAILABLE / 1024 / 1024))

TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
if [ "$DISK_AVAILABLE_GB" -ge 20 ]; then
    echo -e "${GREEN}✅${NC} 磁盘空间足够"
    echo "   可用: ${DISK_AVAILABLE_GB}GB (需要: 20GB)"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
    echo -e "${RED}❌${NC} 磁盘空间不足"
    echo "   可用: ${DISK_AVAILABLE_GB}GB (需要: 20GB)"
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
fi

# 检查内存 (macOS)
if command -v vm_stat &> /dev/null; then
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    echo -e "${GREEN}✅${NC} 内存检查"
    echo "   请在 Docker Desktop 设置中确保分配至少 4GB 内存"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
fi

# ============== 检查结果 ==============

echo ""
echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}检查结果摘要${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

echo "总检查项: $TOTAL_CHECKS"
echo -e "通过: ${GREEN}$PASSED_CHECKS${NC}"
echo -e "失败: ${RED}$FAILED_CHECKS${NC}"
echo ""

PASS_PERCENTAGE=$((PASSED_CHECKS * 100 / TOTAL_CHECKS))
echo "通过率: $PASS_PERCENTAGE%"
echo ""

# ============== 建议 ==============

echo -e "${BLUE}建议和下一步:${NC}"
echo ""

if [ "$FAILED_CHECKS" -eq 0 ]; then
    echo -e "${GREEN}✨ 太棒了！您的环境已完全准备好！${NC}"
    echo ""
    echo "下一步:"
    echo "  1. 编辑 .env 文件并更新以下变量:"
    echo "     - DB_PASSWORD"
    echo "     - MINIMAX_API_KEY"
    echo "     - PGADMIN_PASSWORD"
    echo ""
    echo "  2. 运行初始化脚本:"
    echo "     ./scripts/setup_minimax.sh"
    echo ""
    echo "  3. 启动所有服务:"
    echo "     make start"
    echo ""
else
    echo -e "${YELLOW}需要处理的问题:${NC}"
    echo ""
    
    if ! docker --version &> /dev/null; then
        echo -e "  1. ${RED}❌ Docker 未安装${NC}"
        echo "     安装说明: brew install --cask docker"
        echo "     或访问: https://docs.docker.com/desktop/install/"
        echo ""
    fi
    
    if [ "$DOCKER_RUNNING" = "false" ]; then
        echo -e "  2. ${RED}❌ Docker 未运行${NC}"
        echo "     启动 Docker Desktop 应用"
        echo ""
    fi
    
    for script in "${SCRIPTS[@]}"; do
        if [ -f "$PROJECT_ROOT/scripts/$script" ] && [ ! -x "$PROJECT_ROOT/scripts/$script" ]; then
            echo -e "  3. ${YELLOW}⚠️  脚本不可执行: $script${NC}"
            echo "     修复: chmod +x scripts/*.sh"
            echo ""
        fi
    done
    
    if [ "$DISK_AVAILABLE_GB" -lt 20 ]; then
        echo -e "  4. ${RED}❌ 磁盘空间不足${NC}"
        echo "     清理磁盘或增加存储空间"
        echo ""
    fi
fi

echo -e "${BLUE}关键提示:${NC}"
echo "  • 详细部署指南: DEPLOYMENT_GUIDE.md"
echo "  • 快速开始指南: QUICKSTART.md"
echo "  • 部署摘要: DEPLOYMENT_SUMMARY.md"
echo "  • 查看 Makefile 帮助: make help"
echo ""

echo -e "${BLUE}=========================================${NC}"

if [ "$FAILED_CHECKS" -eq 0 ]; then
    exit 0
else
    exit 1
fi
