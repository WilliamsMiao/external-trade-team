/**
 * Finance Lead - 发票生成工具
 * 
 * 开具发票
 */

const { logAction } = require('../audit');

/**
 * 发票状态
 */
const INVOICE_STATUS = {
  DRAFT: 'draft',
  ISSUED: 'issued',
  SENT: 'sent',
  PAID: 'paid',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled'
};

/**
 * 生成发票
 * 
 * @param {Object} params - 发票参数
 * @param {string} params.customerId - 客户ID
 * @param {string} params.orderId - 订单ID
 * @param {Array} params.items - 项目 [{description, quantity, unitPrice}]
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 发票对象
 */
async function generateInvoice(params, options = {}) {
  const { customerId, orderId, items } = params;
  const {
    currency = 'USD',
    taxRate = 0,
    paymentTerms = 'Net 30',
    issueDate = null
  } = options;
  
  // 1. 获取客户信息
  const customer = await getCustomer(customerId);
  
  // 2. 计算金额
  let subtotal = 0;
  const lineItems = items.map(item => {
    const amount = item.quantity * item.unitPrice;
    subtotal += amount;
    return {
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      amount
    };
  });
  
  // 3. 计算税费和总额
  const tax = subtotal * taxRate;
  const total = subtotal + tax;
  
  // 4. 生成发票号
  const invoiceNumber = generateInvoiceNumber();
  
  // 5. 计算到期日
  const issue = issueDate ? new Date(issueDate) : new Date();
  const dueDate = calculateDueDate(issue, paymentTerms);
  
  // 6. 构建发票
  const invoice = {
    invoice_number: invoiceNumber,
    status: INVOICE_STATUS.DRAFT,
    
    // 客户信息
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      address: customer.address,
      tax_id: customer.tax_id
    },
    
    // 订单信息
    order_id: orderId,
    
    // 项目
    items: lineItems,
    
    // 金额
    pricing: {
      subtotal,
      tax,
      total,
      currency,
      tax_rate: taxRate
    },
    
    // 条款
    terms: {
      payment_terms: paymentTerms,
      issue_date: issue.toISOString().split('T')[0],
      due_date: dueDate.toISOString().split('T')[0]
    },
    
    // 付款信息
    paid_amount: 0,
    paid_date: null,
    
    // 元数据
    created_at: new Date().toISOString(),
    created_by: 'finance_lead',
    version: 1
  };
  
  // 7. 记录审计
  try {
    await logAction(
      6, // Finance Lead agent ID
      'invoice_generated',
      'invoice',
      invoiceNumber,
      { customer: customer.name, total, currency }
    );
  } catch (e) {
    console.log('[Finance] Audit log skipped');
  }
  
  console.log(`[Finance] Generated invoice ${invoiceNumber} for ${customer.name}: ${currency} ${total}`);
  
  return invoice;
}

/**
 * 获取客户信息
 */
async function getCustomer(customerId) {
  // 模拟客户数据
  const customers = {
    'cust-001': {
      id: 'cust-001',
      name: 'ABC Corporation',
      email: 'accounts@abccorp.com',
      address: '123 Main St, New York, NY 10001, USA',
      tax_id: 'US123456789',
      credit_limit: 50000
    },
    'cust-002': {
      id: 'cust-002',
      name: 'XYZ Ltd',
      email: 'finance@xyzltd.com',
      address: '456 Queen St, London, UK',
      tax_id: 'GB987654321',
      credit_limit: 30000
    }
  };
  
  return customers[customerId] || {
    id: customerId,
    name: 'Unknown Customer',
    email: 'unknown@customer.com',
    address: 'N/A',
    tax_id: 'N/A',
    credit_limit: 0
  };
}

/**
 * 计算到期日
 */
function calculateDueDate(issueDate, paymentTerms) {
  const days = parseInt(paymentTerms.replace(/\D/g, '')) || 30;
  const due = new Date(issueDate);
  due.setDate(due.getDate() + days);
  return due;
}

/**
 * 生成发票号
 */
function generateInvoiceNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const seq = Date.now().toString(36).toUpperCase().slice(-4);
  return `INV-${date}-${seq}`;
}

/**
 * 发送发票（mock）
 */
async function sendInvoice(invoice, customerEmail) {
  console.log(`[Finance] Mock: Sending invoice ${invoice.invoice_number} to ${customerEmail}`);
  
  invoice.status = INVOICE_STATUS.SENT;
  invoice.sent_at = new Date().toISOString();
  
  try {
    await logAction(
      6,
      'invoice_sent',
      'invoice',
      invoice.invoice_number,
      { customer: invoice.customer.email }
    );
  } catch (e) {
    console.log('[Finance] Audit log skipped');
  }
  
  return {
    sent: true,
    invoice_number: invoice.invoice_number,
    to: customerEmail,
    sent_at: invoice.sent_at
  };
}

/**
 * 付款提醒
 */
async function paymentReminder(invoiceId) {
  const invoice = await getInvoice(invoiceId);
  
  if (!invoice) {
    throw new Error('Invoice not found');
  }
  
  if (invoice.status === INVOICE_STATUS.PAID) {
    return { message: 'Invoice already paid', invoice: invoice.invoice_number };
  }
  
  // 计算逾期天数
  const dueDate = new Date(invoice.terms.due_date);
  const today = new Date();
  const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
  
  const reminder = {
    invoice_number: invoice.invoice_number,
    customer: invoice.customer.name,
    amount_due: invoice.pricing.total,
    currency: invoice.pricing.currency,
    due_date: invoice.terms.due_date,
    days_overdue: daysOverdue,
    
    // 提醒内容
    message: daysOverdue > 0 
      ? `您的发票 ${invoice.invoice_number} 已逾期 ${daysOverdue} 天，金额 ${invoice.pricing.currency} ${invoice.pricing.total}。请尽快安排付款。`
      : `您的发票 ${invoice.invoice_number} 即将到期，金额 ${invoice.pricing.currency} ${invoice.pricing.total}。`,
    
    sent_at: new Date().toISOString()
  };
  
  // 记录审计
  try {
    await logAction(
      6,
      'payment_reminder_sent',
      'invoice',
      invoiceId,
      { daysOverdue, customer: invoice.customer.name }
    );
  } catch (e) {
    console.log('[Finance] Audit log skipped');
  }
  
  return reminder;
}

/**
 * 获取发票（mock）
 */
async function getInvoice(invoiceId) {
  // 简化：返回mock数据
  return null; // 实际应查数据库
}

/**
 * 成本利润分析
 */
async function costAnalysis(orderId) {
  // 模拟成本分析
  const revenue = 10000; // 假设收入
  const costs = {
    product_cost: 6000,
    shipping: 500,
    duties: 300,
    payment_processing: 200,
    other: 100
  };
  
  const totalCost = Object.values(costs).reduce((a, b) => a + b, 0);
  const profit = revenue - totalCost;
  const margin = (profit / revenue) * 100;
  
  const analysis = {
    order_id: orderId,
    revenue,
    costs,
    total_cost: totalCost,
    profit,
    margin_percent: margin.toFixed(2),
    
    // 建议
    recommendations: margin < 10 
      ? ['建议调整定价', '审查供应商成本']
      : margin > 30
        ? ['利润率良好', '可考虑促销']
        : ['利润率正常'],
    
    analyzed_at: new Date().toISOString()
  };
  
  console.log(`[Finance] Cost analysis for order ${orderId}: Margin ${margin.toFixed(1)}%`);
  
  return analysis;
}

module.exports = {
  generateInvoice,
  sendInvoice,
  paymentReminder,
  costAnalysis,
  INVOICE_STATUS
};
