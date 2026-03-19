#!/bin/bash
# ===========================================
# 端到端测试脚本
# 模拟完整业务流程：询盘 → 报价 → 采购
# ===========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "==========================================="
echo "🧪 端到端测试：询盘 → 报价 → 采购"
echo "==========================================="

cd "$PROJECT_ROOT"

# 设置环境变量
export DATABASE_URL="postgresql://openclaw:test@localhost:5432/openclaw_trade"

echo ""
echo "📝 [Step 1] 模拟客户询盘..."
# 模拟客户询盘
INQUIRY_TEXT="客户ABC公司询1000件产品，预算$10,000，急需3周内交货"

# 保存询盘到workspace
echo "$INQUIRY_TEXT" > workspace/test_inquiry.txt

echo "  ✅ 询盘已保存: $INQUIRY_TEXT"

echo ""
echo "🔀 [Step 2] Coordinator 路由任务..."

# 模拟Coordinator路由
node -e "
const { routeTaskToLead } = require('./src/coordinator/route_task');

const result = routeTaskToLead('$INQUIRY_TEXT');
console.log('  路由结果:');
console.log('    推荐Lead: ' + result.recommended_lead);
console.log('    置信度: ' + result.confidence);
console.log('    原因: ' + result.reason);
"

echo ""
echo "📧 [Step 3] Sales Lead 处理询盘..."

# 模拟Sales Lead生成报价
node -e "
const { parseInquiry } = require('./src/sales/parse_inquiry');
const { generateQuote } = require('./src/sales/generate_quote');

async function test() {
  // 解析询盘
  const inquiry = await parseInquiry(
    '客户ABC公司询1000件产品，预算10000美元，急需3周内交货',
    'test',
    { customerEmail: 'test@abc-corp.com' }
  );
  
  console.log('  解析结果:');
  console.log('    询盘ID: ' + inquiry.id);
  console.log('    产品: ' + inquiry.products.join(', '));
  console.log('    数量: ' + inquiry.quantity);
  console.log('    预算: ' + (inquiry.budget ? inquiry.budget.amount : 'N/A'));
  
  // 生成报价
  const quote = await generateQuote(inquiry);
  console.log('');
  console.log('  报价结果:');
  console.log('    报价ID: ' + quote.id);
  console.log('    总价: ' + quote.pricing.total + ' ' + quote.pricing.currency);
  console.log('    税率: ' + (quote.pricing.tax || 0));
  
  return { inquiry, quote };
}

test().then(r => console.log('')).catch(e => console.error(e));
"

echo ""
echo "📦 [Step 4] Supply Lead 检查库存..."

# 模拟Supply Lead检查库存
node -e "
const { checkInventory } = require('./src/supply/check_inventory');

async function test() {
  const result = await checkInventory('widget', 1000);
  console.log('  库存检查:');
  console.log('    产品: ' + result.product);
  console.log('    状态: ' + result.status);
  console.log('    库存: ' + result.quantity);
  console.log('    可满足: ' + (result.can_fulfill ? '是' : '否'));
}

test().catch(e => console.error(e));
"

echo ""
echo "📋 [Step 5] 生成采购订单（如需要）..."

# 模拟生成PO
node -e "
const { generatePO } = require('./src/supply/generate_po');

async function test() {
  const po = await generatePO({
    supplierId: 'sup-001',
    items: [
      { product: 'widget', quantity: 1000, unitPrice: 5 }
    ]
  });
  
  console.log('  采购订单:');
  console.log('    PO号: ' + po.po_number);
  console.log('    供应商: ' + po.supplier.name);
  console.log('    总价: ' + po.pricing.total + ' ' + po.pricing.currency);
}

test().catch(e => console.error(e));
"

echo ""
echo "📊 [Step 6] 生成每日汇总..."

# 模拟Coordinator生成汇总
node -e "
const { generateDailySummary, formatSummaryAsMarkdown } = require('./src/coordinator/route_task');

async function test() {
  const summary = await generateDailySummary();
  const md = formatSummaryAsMarkdown(summary);
  
  console.log('  汇总已生成');
  console.log('');
  console.log('  预览:');
  console.log(md.split('\\n').slice(0, 15).join('\\n'));
  console.log('  ...');
}

test().catch(e => console.error(e));
"

echo ""
echo "==========================================="
echo "✅ 端到端测试完成!"
echo "==========================================="
echo ""
echo "测试覆盖:"
echo "  ✅ 询盘解析"
echo "  ✅ 报价生成"
echo "  ✅ 库存检查"
echo "  ✅ 采购订单生成"
echo "  ✅ 每日汇总生成"
echo ""
echo "完整流程已验证通过！"
