/**
 * Coordinator - 任务路由工具
 * 
 * 根据任务描述路由给合适的Lead
 */

/**
 * Lead类型
 */
const LEAD_TYPES = {
  SALES: 'sales_lead',
  SUPPLY: 'supply_lead',
  OPS: 'ops_lead',
  FINANCE: 'finance_lead',
  HR: 'hr_trainer'
};

/**
 * 关键词映射
 */
const KEYWORD_MAP = {
  [LEAD_TYPES.SALES]: [
    '询盘', 'inquiry', 'quote', '报价', '客户', 'customer', 
    '订单', 'order', '销售', 'sales', '询价', 'purchase'
  ],
  [LEAD_TYPES.SUPPLY]: [
    '采购', 'purchase', 'supplier', '供应商', '库存', 'inventory',
    '生产', 'production', 'manufacturing', '供货', '补货'
  ],
  [LEAD_TYPES.OPS]: [
    '物流', 'logistics', 'shipping', '发货', '排程', 'schedule',
    '质检', 'qc', 'quality', '运输', 'delivery', '清关', 'customs'
  ],
  [LEAD_TYPES.FINANCE]: [
    '发票', 'invoice', '付款', 'payment', '收款', '催款',
    '账单', 'billing', '财务', 'finance', '对账', 'reconciliation'
  ],
  [LEAD_TYPES.HR]: [
    '招聘', 'hire', 'agent', '配置', 'config', '人事', 'hr'
  ]
};

/**
 * 路由任务到Lead
 * 
 * @param {string} taskDescription - 任务描述
 * @param {Object} options - 选项
 * @returns {Object} 路由结果
 */
function routeTaskToLead(taskDescription, options = {}) {
  const text = taskDescription.toLowerCase();
  
  // 1. 关键词匹配
  let scores = {};
  for (const [lead, keywords] of Object.entries(KEYWORD_MAP)) {
    scores[lead] = 0;
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        scores[lead]++;
      }
    }
  }
  
  // 2. 排序
  const sorted = Object.entries(scores)
    .filter(([_, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);
  
  // 3. 确定推荐Lead
  let recommended = null;
  let confidence = 0;
  
  if (sorted.length > 0) {
    recommended = sorted[0][0];
    confidence = Math.min(sorted[0][1] / 3, 1); // 归一化到0-1
  } else {
    // 默认路由到Coordinator自己处理
    recommended = 'coordinator';
    confidence = 0;
  }
  
  const result = {
    task: taskDescription,
    recommended_lead: recommended,
    confidence: confidence.toFixed(2),
    alternatives: sorted.slice(1, 3).map(([lead, score]) => ({
      lead,
      score
    })),
    reason: generateRoutingReason(recommended, taskDescription),
    routed_at: new Date().toISOString()
  };
  
  console.log(`[Coordinator] Routed task to ${recommended} (confidence: ${result.confidence})`);
  
  return result;
}

/**
 * 生成路由原因
 */
function generateRoutingReason(lead, taskDescription) {
  const reasons = {
    [LEAD_TYPES.SALES]: '检测到销售相关关键词（客户、询盘、报价等）',
    [LEAD_TYPES.SUPPLY]: '检测到采购/供应链相关关键词（供应商、库存、生产等）',
    [LEAD_TYPES.OPS]: '检测到运营相关关键词（物流、质检、运输等）',
    [LEAD_TYPES.FINANCE]: '检测到财务相关关键词（发票、付款、收款等）',
    [LEAD_TYPES.HR]: '检测到人事相关关键词（招聘、Agent配置等）',
    'coordinator': '未识别到具体Lead关键词，需要人工判断'
  };
  
  return reasons[lead] || '基于关键词匹配';
}

/**
 * 生成每日汇总
 * 
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 每日汇总
 */
async function generateDailySummary(options = {}) {
  // 模拟从数据库聚合数据
  const today = new Date().toISOString().split('T')[0];
  
  const summary = {
    date: today,
    title: `📊 每日业务汇总 - ${today}`,
    
    // 销售
    sales: {
      new_inquiries: Math.floor(Math.random() * 10) + 3,
      quotes_sent: Math.floor(Math.random() * 5) + 1,
      orders_confirmed: Math.floor(Math.random() * 3),
      pending: Math.floor(Math.random() * 8)
    },
    
    // 供应链
    supply: {
      pending_pos: Math.floor(Math.random() * 5),
      shipments_in_transit: Math.floor(Math.random() * 8),
      low_stock_items: Math.floor(Math.random() * 4)
    },
    
    // 运营
    operations: {
      active_productions: Math.floor(Math.random() * 6),
      qc_passed: Math.floor(Math.random() * 20) + 10,
      issues_reported: Math.floor(Math.random() * 3)
    },
    
    // 财务
    finance: {
      invoices_issued: Math.floor(Math.random() * 5),
      payments_received: Math.floor(Math.random() * 4),
      overdue_invoices: Math.floor(Math.random() * 2)
    },
    
    // 需要关注的事项
    alerts: generateAlerts(),
    
    generated_at: new Date().toISOString()
  };
  
  console.log(`[Coordinator] Generated daily summary for ${today}`);
  
  return summary;
}

/**
 * 生成告警
 */
function generateAlerts() {
  const alerts = [];
  
  // 随机生成告警
  if (Math.random() > 0.7) {
    alerts.push({
      type: 'warning',
      category: 'supply',
      message: '部分产品库存偏低，建议及时补货'
    });
  }
  
  if (Math.random() > 0.8) {
    alerts.push({
      type: 'info',
      category: 'finance',
      message: '有发票即将到期，请跟进收款'
    });
  }
  
  return alerts;
}

/**
 * 风险告警
 */
function riskAlert(risks) {
  const alerts = risks.map(risk => ({
    id: `RISK-${Date.now().toString(36).toUpperCase()}`,
    ...risk,
    created_at: new Date().toISOString()
  }));
  
  console.log(`[Coordinator] Generated ${alerts.length} risk alerts`);
  
  return alerts;
}

/**
 * 格式化汇总为Markdown
 */
function formatSummaryAsMarkdown(summary) {
  let md = `# ${summary.title}\n\n`;
  
  // 销售
  md += `## 📈 销售\n`;
  md += `- 新询盘: ${summary.sales.new_inquiries}\n`;
  md += `- 已报价: ${summary.sales.quotes_sent}\n`;
  md += `- 已确认订单: ${summary.sales.orders_confirmed}\n`;
  md += `- 待处理: ${summary.sales.pending}\n\n`;
  
  // 供应链
  md += `## 🚚 供应链\n`;
  md += `- 待确认PO: ${summary.supply.pending_pos}\n`;
  md += `- 运输中: ${summary.supply.shipments_in_transit}\n`;
  md += `- 库存预警: ${summary.supply.low_stock_items}\n\n`;
  
  // 运营
  md += `## ⚙️ 运营\n`;
  md += `- 生产中: ${summary.operations.active_productions}\n`;
  md += `- 质检通过: ${summary.operations.qc_passed}\n`;
  md += `- 问题上报: ${summary.operations.issues_reported}\n\n`;
  
  // 财务
  md += `## 💰 财务\n`;
  md += `- 已开发票: ${summary.finance.invoices_issued}\n`;
  md += `- 已收款: ${summary.finance.payments_received}\n`;
  md += `- 逾期发票: ${summary.finance.overdue_invoices}\n\n`;
  
  // 告警
  if (summary.alerts && summary.alerts.length > 0) {
    md += `## ⚠️ 需要关注\n`;
    for (const alert of summary.alerts) {
      md += `- [${alert.type}] ${alert.category}: ${alert.message}\n`;
    }
  }
  
  md += `\n---\n`;
  md += `*由 Coordinator 自动生成*\n`;
  
  return md;
}

module.exports = {
  routeTaskToLead,
  generateDailySummary,
  riskAlert,
  formatSummaryAsMarkdown,
  LEAD_TYPES
};
