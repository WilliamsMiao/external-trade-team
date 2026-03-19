#!/bin/bash
# ===========================================
# 实时监控脚本 - watch_status.sh
# 每 5 秒刷新一次运行态总览
# ===========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

while true; do
  clear
  echo "$(date '+%Y-%m-%d %H:%M:%S')"
  ./scripts/runtime_status.sh || true
  echo ""
  echo "(Ctrl+C 退出实时监控)"
  sleep 5
done
