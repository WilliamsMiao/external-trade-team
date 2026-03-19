#!/bin/bash
# ===========================================
# 运行态可观测脚本 - runtime_status.sh
# 显示 Agent、任务队列、审计活动
# ===========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="docker-compose-dev.yml"
DC="docker compose -f $COMPOSE_FILE"

cd "$PROJECT_ROOT"

echo "==========================================="
echo "运行态总览"
echo "==========================================="

echo ""
echo "[1/5] API 健康:"
curl -sf "http://localhost:18789/health" || echo "❌ /health 不可达"

echo ""
echo "[2/5] API 就绪:"
curl -sf "http://localhost:18789/ready" || echo "❌ /ready 不可达"

echo ""
echo "[3/5] Agent 状态:"
$DC exec -T postgres psql -U openclaw -d openclaw_trade -c "
SELECT
  id,
  name,
  type,
  status,
  to_char(last_activity, 'YYYY-MM-DD HH24:MI:SS') AS last_activity
FROM agents
ORDER BY id;
"

echo ""
echo "[4/5] 任务队列统计:"
$DC exec -T postgres psql -U openclaw -d openclaw_trade -c "
SELECT status, COUNT(*) AS count
FROM tasks
GROUP BY status
ORDER BY status;
"

echo ""
echo "[5/6] 最近 10 条业务动作:"
$DC exec -T postgres psql -U openclaw -d openclaw_trade -c "
SELECT
  to_char(a.timestamp, 'MM-DD HH24:MI:SS') AS ts,
  COALESCE(ag.name, 'system') AS agent,
  a.action,
  COALESCE(a.target_type, '-') AS target_type,
  COALESCE(a.target_id, '-') AS target_id
FROM audit_log a
LEFT JOIN agents ag ON ag.id = a.agent_id
ORDER BY a.timestamp DESC
LIMIT 10;
"

echo ""
echo "[6/6] 管理驾驶舱摘要:"
if curl -sf "http://localhost:18789/manager-dashboard?limit=5" > /tmp/manager_dashboard.json; then
  cat /tmp/manager_dashboard.json | head -5
else
  echo "❌ /manager-dashboard 不可达"
fi

echo ""
echo "✅ 运行态总览完成"
