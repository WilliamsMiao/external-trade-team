/**
 * Sales Lead - 报价生成工具
 * 
 * 根据询盘信息生成报价单
 */

const { logAction } = require('../audit');
const path = require('path');

/**
 * 报价单状态
 */
const QUOTE_STATUS = {
  DRAFT: 'draft',
  SENT: 'sent',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  EXPIRED: 'expired'
};

/**
 * 生成报价
 * 
 * @param {Object} inquiry - 询盘对象 (parseInquiry的输出)
 * @param {Object} options - 报价选项
 * @param {number} options.margin - 利润率 (默认 0.15)
 * @param {string} options.incoterms - 国际贸易条款 (默认 EXW)
 * @param {string} options.paymentTerms - 付款条件 (默认 T/T 30%)
 * @param {number} options.leadTimeDays - 交货周期天数
 * @param {string} options.validUntil - 有效期
 * @returns {Promise<Object>} 报价单对象
 */
async function generateQuote(inquiry, options = {}) {
  const {
    margin = 0.15,
    incoterms = 'EXW',
    paymentTerms = 'T/T 30%',
    leadTimeDays = 14,
    validUntil = null
  } = options;
  
  // 1. 计算单价（基于预算或市场价）
  const unitPrice = calculateUnitPrice(inquiry, margin);
  
  // 2. 计算总价
  const quantity = inquiry.quantity || 100; // 默认100
  const subtotal = unitPrice * quantity;
  const freight = calculateFreight(incoterms, quantity);
  const tax = calculateTax(subtotal, inquiry.customer?.country);
  const total = subtotal + freight + tax;
  
  // 3. 生成报价单号
  const quoteId = generateQuoteId();
  
  // 4. 构建报价单
  const quote = {
    id: quoteId,
    inquiry_id: inquiry.id,
    status: QUOTE_STATUS.DRAFT,
    
    // 产品信息
    products: inquiry.products,
    quantity,
    unit_price: unitPrice,
    currency: 'USD',
    
    // 价格明细
    pricing: {
      subtotal,
      freight,
      tax,
      total,
      margin
    },
    
    // 条款
    terms: {
      incoterms,
      payment_terms: paymentTerms,
      lead_time_days: leadTimeDays,
      valid_until: validUntil || calculateValidDate(30),
      warranty_months: 12
    },
    
    // 客户信息
    customer: inquiry.customer,
    
    // 元数据
    created_at: new Date().toISOString(),
    created_by: 'sales_lead',
    version: 1
  };
  
  // 5. 记录审计日志
  try {
    await logAction(
      3, // Sales Lead agent ID
      'quote_generated',
      'quote',
      quoteId,
      {
        inquiry_id: inquiry.id,
        customer: inquiry.customer?.email,
        total,
        currency: 'USD'
      }
    );
  } catch (e) {
    console.log('[Sales] Audit log skipped (no DB):', e.message);
  }
  
  console.log(`[Sales] Generated quote ${quoteId} for inquiry ${inquiry.id}: Total $${total}`);
  
  return quote;
}

/**
 * 计算单价
 */
function calculateUnitPrice(inquiry, margin) {
  // 如果有预算，基于预算计算
  if (inquiry.budget && inquiry.quantity) {
    const budgetPerUnit = inquiry.budget.amount / inquiry.quantity;
    // 给客户留出议价空间，报价比预算低5%
    return budgetPerUnit * 0.95;
  }
  
  // 默认市场价（实际应该查产品数据库）
  const basePrice = 10; // 假设基础价$10
  return basePrice * (1 + margin);
}

/**
 * 计算运费
 */
function calculateFreight(incoterms, quantity) {
  // EXW不含运费，其他条款需要计算
  if (incoterms === 'EXW') {
    return 0;
  }
  
  // 简化计算：按数量和目的地区分
  const freightRates = {
    'FOB': { small: 50, medium: 100, large: 200 },
    'CIF': { small: 100, medium: 200, large: 400 },
    'DDP': { small: 150, medium: 300, large: 600 }
  };
  
  let size = 'medium';
  if (quantity < 100) size = 'small';
  if (quantity > 1000) size = 'large';
  
  return freightRates[incoterms]?.[size] || 100;
}

/**
 * 计算税费
 */
function calculateTax(subtotal, country) {
  // 简化：不同国家不同税率
  const taxRates = {
    'USA': 0,
    'UK': 0.20,
    'Germany': 0.19,
    'Japan': 0.10,
    'China': 0.13,
    'default': 0.10
  };
  
  const rate = taxRates[country] ?? taxRates.default;
  return subtotal * rate;
}

/**
 * 计算有效期
 */
function calculateValidDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

/**
 * 生成报价单ID
 */
function generateQuoteId() {
  const timestamp = Date.now().toString(36).toUpperCase();
  return `QUO-${timestamp}`;
}

/**
 * 保存报价单
 */
async function saveQuote(quote) {
  const fs = require('fs-extra');
  const workspaceDir = path.join(__dirname, '../../workspace');
  await fs.ensureDir(workspaceDir);
  
  const filename = `quote_${quote.id}.json`;
  await fs.writeFile(
    path.join(workspaceDir, filename),
    JSON.stringify(quote, null, 2)
  );
  
  return filename;
}

/**
 * 发送报价邮件（mock）
 */
async function sendQuoteEmail(quote, customerEmail) {
  // 实际应该调用邮件服务
  console.log(`[Sales] Mock: Sending quote ${quote.id} to ${customerEmail}`);
  
  // 记录发送日志
  try {
    await logAction(
      3,
      'quote_sent',
      'quote',
      quote.id,
      {
        customer: customerEmail,
        total: quote.pricing.total
      }
    );
  } catch (e) {
    console.log('[Sales] Audit log skipped');
  }
  
  return {
    sent: true,
    quote_id: quote.id,
    to: customerEmail,
    sent_at: new Date().toISOString()
  };
}

/**
 * 根据语言/区域路由给专门Sales
 */
function routeToSpecialist(inquiry) {
  // 简单路由逻辑
  const routing = {
    'ja': 'jp_sales',
    'zh': 'cn_sales',
    'ko': 'kr_sales',
    'en': 'sales_lead' // 默认
  };
  
  const lang = inquiry.language || 'en';
  return routing[lang] || 'sales_lead';
}

module.exports = {
  generateQuote,
  saveQuote,
  sendQuoteEmail,
  routeToSpecialist,
  QUOTE_STATUS
};
