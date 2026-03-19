/**
 * Ops Lead - 生产排程工具
 * 
 * 安排生产计划
 */

const { logAction } = require('../audit');

/**
 * 生产单状态
 */
const PRODUCTION_STATUS = {
  SCHEDULED: 'scheduled',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  DELAYED: 'delayed',
  CANCELLED: 'cancelled'
};

/**
 * 安排生产
 * 
 * @param {Object} params - 生产参数
 * @param {string} params.product - 产品
 * @param {number} params.quantity - 数量
 * @param {string} params.priority - 优先级 (normal/urgent)
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 生产单
 */
async function scheduleProduction(params, options = {}) {
  const { product, quantity, priority = 'normal' } = params;
  const {
    startDate = null,
    notes = ''
  } = options;
  
  // 1. 计算生产周期（基于数量）
  const productionDays = calculateProductionDays(quantity);
  
  // 2. 确定开始和结束日期
  const start = startDate ? new Date(startDate) : new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + productionDays);
  
  // 3. 生成生产单号
  const productionId = generateProductionId();
  
  // 4. 检查资源可用性
  const resources = await checkResources(product, quantity);
  
  // 5. 构建生产单
  const production = {
    id: productionId,
    status: PRODUCTION_STATUS.SCHEDULED,
    
    // 生产信息
    product,
    quantity,
    priority,
    
    // 排程
    scheduled_start: start.toISOString().split('T')[0],
    scheduled_end: end.toISOString().split('T')[0],
    production_days: productionDays,
    
    // 资源
    resources,
    
    // 备注
    notes,
    
    // 元数据
    created_at: new Date().toISOString(),
    created_by: 'ops_lead',
    version: 1
  };
  
  // 6. 记录审计日志
  try {
    await logAction(
      5, // Ops Lead agent ID
      'production_scheduled',
      'production',
      productionId,
      { product, quantity, priority, scheduled_end: production.scheduled_end }
    );
  } catch (e) {
    console.log('[Ops] Audit log skipped');
  }
  
  console.log(`[Ops] Scheduled production ${productionId}: ${product} x${quantity}, Due: ${production.scheduled_end}`);
  
  return production;
}

/**
 * 计算生产周期
 */
function calculateProductionDays(quantity) {
  // 简化：每1000件需要1天，最少3天，最多30天
  const days = Math.ceil(quantity / 1000);
  return Math.max(3, Math.min(30, days));
}

/**
 * 检查资源可用性
 */
async function checkResources(product, quantity) {
  // 模拟资源检查
  return {
    workers: { available: 10, required: Math.ceil(quantity / 100) },
    machines: { available: 5, required: Math.ceil(quantity / 500) },
    materials: { status: 'available', notes: 'Sufficient stock' }
  };
}

/**
 * 生成生产单ID
 */
function generateProductionId() {
  const timestamp = Date.now().toString(36).toUpperCase();
  return `PRD-${timestamp}`;
}

/**
 * 质检清单生成
 */
async function generateQCChecklist(productionId, product, quantity) {
  const checklist = {
    id: `QC-${Date.now().toString(36).toUpperCase()}`,
    production_id: productionId,
    product,
    quantity,
    
    // 质检项目
    items: [
      { name: '外观检查', standard: '无明显划痕/变形', pass: null },
      { name: '尺寸测量', standard: '符合规格±2mm', pass: null },
      { name: '功能测试', standard: '100%功能正常', pass: null },
      { name: '包装检查', standard: '符合运输标准', pass: null },
      { name: '标签检查', standard: '清晰完整', pass: null }
    ],
    
    // 抽检比例
    sample_size: Math.ceil(quantity * 0.1), // 10%抽检
    sample_method: '随机抽样',
    
    // 结果
    total_checked: 0,
    passed: 0,
    failed: 0,
    status: 'pending',
    
    created_at: new Date().toISOString()
  };
  
  console.log(`[Ops] Generated QC checklist ${checklist.id} for production ${productionId}`);
  
  return checklist;
}

/**
 * 问题上报
 */
async function issueReport(params) {
  const { productionId, issueType, description, severity = 'medium' } = params;
  
  const report = {
    id: `ISS-${Date.now().toString(36).toUpperCase()}`,
    production_id: productionId,
    type: issueType,
    description,
    severity,
    status: 'open',
    
    // 分配给
    assignee: getAssignee(issueType),
    
    created_at: new Date().toISOString(),
    created_by: 'ops_lead'
  };
  
  // 记录审计
  try {
    await logAction(
      5,
      'issue_reported',
      'issue',
      report.id,
      { productionId, issueType, severity }
    );
  } catch (e) {
    console.log('[Ops] Audit log skipped');
  }
  
  // 通知对应Lead
  if (severity === 'high' || severity === 'urgent') {
    console.log(`[Ops] Alert: ${report.assignee} for issue ${report.id}`);
  }
  
  return report;
}

/**
 * 获取问题分配
 */
function getAssignee(issueType) {
  const assignments = {
    'quality': 'sales_lead',
    'delivery': 'supply_lead',
    'technical': 'ops_lead',
    'payment': 'finance_lead',
    'default': 'coordinator'
  };
  return assignments[issueType] || assignments.default;
}

module.exports = {
  scheduleProduction,
  generateQCChecklist,
  issueReport,
  PRODUCTION_STATUS
};
