/**
 * Sales Lead - 询盘解析工具
 * 
 * 解析客户询盘信息，提取结构化数据
 */

const fs = require('fs-extra');
const path = require('path');

/**
 * 询盘来源类型
 */
const INQUIRY_SOURCE = {
  EMAIL: 'email',
  TELEGRAM: 'telegram',
  MANUAL: 'manual'
};

/**
 * 解析询盘
 * 
 * @param {string} text - 询盘文本（邮件或消息）
 * @param {string} source - 来源类型 (email/telegram/manual)
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 结构化询盘信息
 */
async function parseInquiry(text, source = INQUIRY_SOURCE.MANUAL, options = {}) {
  // 1. 提取产品信息（简单关键词匹配）
  const products = extractProducts(text);
  
  // 2. 提取数量
  const quantity = extractQuantity(text);
  
  // 3. 提取预算
  const budget = extractBudget(text);
  
  // 4. 提取交期要求
  const deliveryDate = extractDeliveryDate(text);
  
  // 5. 提取客户信息
  const customerInfo = extractCustomerInfo(text, options.customerEmail);
  
  // 6. 提取语言/区域
  const language = detectLanguage(text);
  
  // 7. 生成询盘ID
  const inquiryId = generateInquiryId();
  
  const result = {
    id: inquiryId,
    source,
    products,
    quantity,
    budget,
    deliveryDate,
    language,
    customer: customerInfo,
    raw_text: text.substring(0, 500), // 保留原文摘要
    created_at: new Date().toISOString(),
    status: 'new' // new/qualified/quoted/rejected
  };
  
  console.log(`[Sales] Parsed inquiry ${inquiryId}:`, result.products, '| Qty:', quantity, '| Budget:', budget);
  
  return result;
}

/**
 * 提取产品信息
 */
function extractProducts(text) {
  const products = [];
  const textLower = text.toLowerCase();
  
  // 常见产品关键词（可扩展）
  const productKeywords = [
    'widget', 'gadget', 'electronics', 'clothing', 'toy', 
    'machine', 'parts', 'component', 'sensor', 'module',
    '手机', '电脑', '服装', '玩具', '电子产品'
  ];
  
  for (const keyword of productKeywords) {
    if (textLower.includes(keyword)) {
      products.push(keyword);
    }
  }
  
  // 如果没找到具体产品，返回通用
  if (products.length === 0) {
    products.push('product'); // 待确认
  }
  
  return [...new Set(products)]; // 去重
}

/**
 * 提取数量
 */
function extractQuantity(text) {
  // 匹配模式: 1000件, 1000 pcs, 1k units 等
  const patterns = [
    /(\d+)\s*(?:件|个|台|套|批|pcs?|units?|pieces?)/i,
    /(\d+)k\s*(?:件|个|pcs?)/i,
    /quantity[:\s]*(\d+)/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let qty = parseInt(match[1]);
      if (match[0].includes('k')) {
        qty *= 1000;
      }
      return qty;
    }
  }
  
  return null;
}

/**
 * 提取预算
 */
function extractBudget(text) {
  const patterns = [
    /\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/,  // $1000 或 $1,000.00
    /预算[:\s]*(\d+(?:,\d{3})*(?:\.\d{2})?)/i, // 预算: 10000
    /usd\s*(\d+)/i,
    /(\d+)\s*usd/i,
    /price\s*(?:is|range)?\s*\$?(\d+)/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return {
        amount: parseFloat(match[1].replace(/,/g, '')),
        currency: 'USD'
      };
    }
  }
  
  return null;
}

/**
 * 提取交期要求
 */
function extractDeliveryDate(text) {
  const textLower = text.toLowerCase();
  
  // 急迫表达
  if (textLower.includes('urgent') || textLower.includes('紧急') || textLower.includes('急')) {
    return { type: 'urgent', days: 7 };
  }
  
  // 匹配具体日期
  const datePatterns = [
    /(\d{4})-(\d{2})-(\d{2})/, // 2026-03-31
    /(\d{2})\/(\d{2})\/(\d{4})/, // 03/31/2026
  ];
  
  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      return { type: 'specific', date: match[0] };
    }
  }
  
  // 匹配天数
  const dayPatterns = [
    /(\d+)\s*days?/i,
    /(\d+)\s*天内/i
  ];
  
  for (const pattern of dayPatterns) {
    const match = text.match(pattern);
    if (match) {
      return { type: 'days', days: parseInt(match[1]) };
    }
  }
  
  return null;
}

/**
 * 提取客户信息
 */
function extractCustomerInfo(text, knownEmail) {
  const info = {
    name: null,
    company: null,
    email: knownEmail || null,
    phone: null,
    country: null
  };
  
  // 提取邮箱
  const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (emailMatch) {
    info.email = emailMatch[0];
  }
  
  // 提取公司名（简单匹配）
  const companyPatterns = [
    /from\s+([A-Z][\w\s]+(?:Inc|LLC|Corp|Ltd))/i,
    /公司[:\s]*([^\n,，]+)/
  ];
  
  for (const pattern of companyPatterns) {
    const match = text.match(pattern);
    if (match) {
      info.company = match[1].trim();
      break;
    }
  }
  
  // 提取国家
  const countries = ['USA', 'UK', 'Germany', 'Japan', 'China', 'Korea', 'Australia', 'Canada'];
  for (const country of countries) {
    if (text.toLowerCase().includes(country.toLowerCase())) {
      info.country = country;
      break;
    }
  }
  
  return info;
}

/**
 * 检测语言
 */
function detectLanguage(text) {
  // 简单语言检测
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g);
  const japaneseChars = text.match(/[\u3040-\u309f\u30a0-\u30ff]/g);
  
  if (chineseChars && chineseChars.length > text.length * 0.3) {
    return 'zh';
  }
  if (japaneseChars && japaneseChars.length > 5) {
    return 'ja';
  }
  
  return 'en';
}

/**
 * 生成询盘ID
 */
function generateInquiryId() {
  const timestamp = Date.now().toString(36).toUpperCase();
  return `INQ-${timestamp}`;
}

/**
 * 保存询盘到文件（用于调试/日志）
 */
async function saveInquiry(inquiry) {
  const workspaceDir = path.join(__dirname, '../../workspace');
  await fs.ensureDir(workspaceDir);
  
  const filename = `inquiry_${inquiry.id}.json`;
  await fs.writeFile(
    path.join(workspaceDir, filename),
    JSON.stringify(inquiry, null, 2)
  );
  
  return filename;
}

module.exports = {
  parseInquiry,
  saveInquiry,
  INQUIRY_SOURCE
};
