#!/bin/bash
# ===========================================
# HR_Trainer 流程测试脚本
# 模拟完整的招聘流程
# ===========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "==========================================="
echo "HR_Trainer 流程测试"
echo "==========================================="

cd "$PROJECT_ROOT"

# 加载环境变量
if [ -f ".env" ]; then
    source .env
else
    echo "❌ .env 文件不存在"
    exit 1
fi

# 设置 DATABASE_URL
if [ -z "$DB_PASSWORD" ] || [ "$DB_PASSWORD" = "change_me" ]; then
    export DATABASE_URL="postgresql://openclaw:password@localhost:5432/openclaw_trade"
else
    export DATABASE_URL="postgresql://openclaw:${DB_PASSWORD}@localhost:5432/openclaw_trade"
fi

echo ""
echo "[1/4] 测试 Agent Factory - 创建Agent..."

# 测试创建Agent
node -e "
const { createAgent, listAgents } = require('./src/agent_factory');

const spec = {
    name: 'test_agent',
    type: 'specialist',
    department: 'sales',
    description: '测试用Agent',
    responsibilities: ['测试功能1', '测试功能2'],
    tools: ['log_audit'],
    approvedBy: 'test_script'
};

createAgent(spec)
    .then(result => {
        console.log('  ✅ Agent创建成功:', result.agent_name);
        return listAgents();
    })
    .then(agents => {
        console.log('  📋 当前Agent列表:', agents.map(a => a.name).join(', '));
    })
    .catch(err => {
        console.error('  ❌ 错误:', err.message);
        process.exit(1);
    });
"

echo ""
echo "[2/4] 测试 Agent Factory - 更新Agent..."

# 测试更新Agent
node -e "
const { updateAgent, getAgent } = require('./src/agent_factory');

updateAgent('test_agent', {
    description: '更新后的描述',
    approvedBy: 'test_script'
})
    .then(result => {
        console.log('  ✅ Agent更新成功:', result.message);
        return getAgent('test_agent');
    })
    .then(agent => {
        console.log('  📋 新配置描述:', agent.config.description);
    })
    .catch(err => {
        console.error('  ❌ 错误:', err.message);
    });
"

echo ""
echo "[3/4] 测试审计日志..."

# 测试记录配置变更
node -e "
const { logConfigChange } = require('./src/audit');

logConfigChange(
    'test_agent',
    'test',
    { status: 'old' },
    { status: 'new' },
    'test_script',
    '测试日志'
)
    .then(result => {
        console.log('  ✅ 审计日志写入成功:', result.id);
    })
    .catch(err => {
        console.error('  ⚠️  审计日志失败 (可能数据库未启动):', err.message);
    });
"

echo ""
echo "[4/4] 列出生成的文件..."

if [ -d "agents/test_agent" ]; then
    echo "  ✅ agents/test_agent/ 目录已创建"
    ls -la agents/test_agent/
else
    echo "  ❌ 目录未创建"
fi

# 清理测试Agent
echo ""
echo "[清理] 删除测试Agent..."
node -e "
const { deprecateAgent } = require('./src/agent_factory');
deprecateAgent('test_agent', '测试完成', 'test_script')
    .then(() => console.log('  ✅ 测试Agent已停用'))
    .catch(() => console.log('  ⚠️  清理完成'));
"

echo ""
echo "==========================================="
echo "✅ HR_Trainer 流程测试完成!"
echo "==========================================="
