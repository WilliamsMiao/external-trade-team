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

const PRIORITY_WEIGHT = {
  high: 1,
  medium: 0.7,
  low: 0.45,
};

function extractBusinessSignals(taskDescription = '') {
  const text = String(taskDescription || '');
  const normalized = text.toLowerCase();

  const amountMatch = text.match(/\$\s*(\d+(?:,\d{3})*(?:\.\d+)?)/) || text.match(/预算\s*(\d+(?:,\d{3})*(?:\.\d+)?)/);
  const quantityMatch = text.match(/(\d+)\s*(?:件|个|台|套|pcs|pieces?|units?)/i);
  const daysMatch = text.match(/(\d+)\s*(?:天|days?)/i);

  const budget = amountMatch ? Number(String(amountMatch[1]).replace(/,/g, '')) : 0;
  const quantity = quantityMatch ? Number(quantityMatch[1]) : 0;
  const dueDays = daysMatch ? Number(daysMatch[1]) : null;
  const urgency = dueDays !== null ? (dueDays <= 15 ? 'high' : dueDays <= 30 ? 'medium' : 'low') : 'medium';

  return {
    text: normalized,
    budget,
    quantity,
    dueDays,
    urgency,
    hasBuyerIntent: /(询价|inquiry|quote|purchase|order|客户|buyer)/i.test(text),
    hasFulfillmentRisk: /(库存|inventory|shipping|物流|交付|delivery|production|生产)/i.test(text),
  };
}

function estimateBusinessValue(signals = {}, recommendedLead = 'coordinator') {
  const base = signals.budget > 0
    ? signals.budget
    : (signals.quantity > 0 ? signals.quantity * 28 : 4500);

  const conversionByLead = {
    sales_lead: 0.55,
    supply_lead: 0.4,
    ops_lead: 0.35,
    finance_lead: 0.3,
    hr_trainer: 0.15,
    coordinator: 0.25,
  };

  const urgencyWeight = PRIORITY_WEIGHT[signals.urgency || 'medium'] || 0.7;
  const conversion = conversionByLead[recommendedLead] || 0.25;
  const expectedValue = Number((base * conversion * urgencyWeight).toFixed(2));

  return {
    potentialDealValue: Number(base.toFixed(2)),
    expectedDealValue: expectedValue,
    urgency: signals.urgency || 'medium',
    dueDays: signals.dueDays,
  };
}

/**
 * 路由任务到Lead
 * 
 * @param {string} taskDescription - 任务描述
 * @param {Object} options - 选项
 * @returns {Object} 路由结果
 */
function routeTaskToLead(taskDescription, options = {}) {
  const signals = extractBusinessSignals(taskDescription);
  const text = signals.text;
  
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
    const keywordConfidence = Math.min(sorted[0][1] / 3, 1);
    const businessBoost = signals.hasBuyerIntent ? 0.12 : 0;
    confidence = Math.min(keywordConfidence + businessBoost, 1); // 归一化到0-1
  } else {
    // 默认路由到Coordinator自己处理
    recommended = 'coordinator';
    confidence = 0;
  }
  
  const business = estimateBusinessValue(signals, recommended);

  const result = {
    task: taskDescription,
    recommended_lead: recommended,
    confidence: confidence.toFixed(2),
    alternatives: sorted.slice(1, 3).map(([lead, score]) => ({
      lead,
      score
    })),
    reason: generateRoutingReason(recommended, taskDescription, business),
    business,
    routed_at: new Date().toISOString()
  };
  
  console.log(`[Coordinator] Routed task to ${recommended} (confidence: ${result.confidence})`);
  
  return result;
}

/**
 * 生成路由原因
 */
function generateRoutingReason(lead, taskDescription, business = {}) {
  const reasons = {
    [LEAD_TYPES.SALES]: '检测到销售意图（客户、询盘、报价）且对成交价值影响最大',
    [LEAD_TYPES.SUPPLY]: '检测到供应链风险（供应商、库存、生产）需优先保障交付',
    [LEAD_TYPES.OPS]: '检测到履约执行关键词（物流、排程、运输）需运营介入',
    [LEAD_TYPES.FINANCE]: '检测到资金与回款关键词（发票、付款、收款）需财务跟进',
    [LEAD_TYPES.HR]: '检测到人事相关关键词（招聘、Agent配置等）',
    'coordinator': '未识别到具体Lead关键词，需要人工判断'
  };

  const base = reasons[lead] || '基于关键词匹配';
  if (!business || !business.potentialDealValue) return base;
  return `${base}；预计机会金额 $${business.potentialDealValue}，期望价值 $${business.expectedDealValue}。`;
}

/**
 * 生成每日汇总
 * 
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 每日汇总
 */
async function generateDailySummary(options = {}) {
  const snapshot = options.snapshot || {};
  const sales = snapshot.sales || {};
  const supply = snapshot.supply || {};
  const operations = snapshot.operations || {};
  const finance = snapshot.finance || {};

  const today = new Date().toISOString().split('T')[0];
  
  const summary = {
    date: today,
    title: `📊 每日业务汇总 - ${today}`,
    
    // 销售
    sales: {
      new_inquiries: Number(sales.new_inquiries || 0),
      quotes_sent: Number(sales.quotes_sent || 0),
      orders_confirmed: Number(sales.orders_confirmed || 0),
      pending: Number(sales.pending || 0)
    },
    
    // 供应链
    supply: {
      pending_pos: Number(supply.pending_pos || 0),
      shipments_in_transit: Number(supply.shipments_in_transit || 0),
      low_stock_items: Number(supply.low_stock_items || 0)
    },
    
    // 运营
    operations: {
      active_productions: Number(operations.active_productions || 0),
      qc_passed: Number(operations.qc_passed || 0),
      issues_reported: Number(operations.issues_reported || 0)
    },
    
    // 财务
    finance: {
      invoices_issued: Number(finance.invoices_issued || 0),
      payments_received: Number(finance.payments_received || 0),
      overdue_invoices: Number(finance.overdue_invoices || 0)
    },
    
    generated_at: new Date().toISOString()
  };

  // 需要关注的事项
  summary.alerts = generateAlerts(summary);
  
  console.log(`[Coordinator] Generated daily summary for ${today}`);
  
  return summary;
}

/**
 * 生成告警
 */
function generateAlerts(summary = {}) {
  const alerts = [];

  if ((summary.supply?.low_stock_items || 0) > 0) {
    alerts.push({
      type: 'warning',
      category: 'supply',
      message: '部分产品库存偏低，建议及时补货'
    });
  }

  if ((summary.finance?.overdue_invoices || 0) > 0) {
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
