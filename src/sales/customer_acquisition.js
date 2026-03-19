/**
 * 获客模块 - 客户开发与管理
 * 
 * 询盘处理 → 客户管理 → CRM集成 → 自动跟进
 */

const fs = require('fs-extra');
const path = require('path');

/**
 * 获客管理器
 */
class CustomerAcquisition {
  constructor(config = {}) {
    this.dataDir = config.dataDir || './data';
    this.customers = [];
    this.inquiries = [];
    this.loadData();
  }

  /**
   * 加载数据
   */
  loadData() {
    try {
      const customersFile = path.join(this.dataDir, 'customers.json');
      if (fs.existsSync(customersFile)) {
        this.customers = JSON.parse(fs.readFileSync(customersFile, 'utf8'));
      }
      
      const inquiriesFile = path.join(this.dataDir, 'inquiries.json');
      if (fs.existsSync(inquiriesFile)) {
        this.inquiries = JSON.parse(fs.readFileSync(inquiriesFile, 'utf8'));
      }
    } catch (e) {
      console.log('[Acquisition] Using empty data');
    }
  }

  /**
   * 保存数据
   */
  saveData() {
    fs.ensureDirSync(this.dataDir);
    fs.writeFileSync(
      path.join(this.dataDir, 'customers.json'),
      JSON.stringify(this.customers, null, 2)
    );
    fs.writeFileSync(
      path.join(this.dataDir, 'inquiries.json'),
      JSON.stringify(this.inquiries, null, 2)
    );
  }

  /**
   * 处理询盘
   */
  async processInquiry(rawInquiry) {
    console.log('[Acquisition] Processing inquiry...');
    
    // 1. 解析询盘
    const inquiry = this.parseInquiry(rawInquiry);
    
    // 2. 查找或创建客户
    const customer = await this.findOrCreateCustomer(inquiry);
    
    // 3. 评估客户价值
    const customerValue = this.assessCustomerValue(customer, inquiry);
    
    // 4. 生成报价
    const quote = this.generateQuote(inquiry);
    
    // 5. 确定跟进策略
    const strategy = this.determineStrategy(customerValue, inquiry);
    
    // 6. 保存询盘记录
    inquiry.customerId = customer.id;
    inquiry.quoteId = quote.id;
    inquiry.strategy = strategy;
    inquiry.status = 'pending';
    this.inquiries.push(inquiry);
    this.saveData();
    
    return {
      inquiry,
      customer,
      quote,
      strategy,
      actions: this.generateActions(strategy)
    };
  }

  /**
   * 解析询盘
   */
  parseInquiry(raw) {
    const text = typeof raw === 'string' ? raw : raw.text || '';
    
    // 提取信息
    const productMatch = text.match(/([\u4e00-\u9fa5a-zA-Z0-9\s]+?)(?:产品|product|要|买|询)/i);
    const quantityMatch = text.match(/(\d+)\s*(?:件|个|台|套|pcs|pieces?|units?)/i);
    const budgetMatch = text.match(/\$?\s*(\d+(?:,\d{3})*(?:\.\d+)?)/);
    const countryMatch = text.match(/(美国|UK|Germany|Japan|China|Vietnam|India|Korea)/i);
    
    return {
      id: `INQ_${Date.now()}`,
      raw: text.substring(0, 500),
      product: productMatch ? productMatch[1].trim() : '待确认',
      quantity: quantityMatch ? parseInt(quantityMatch[1]) : null,
      budget: budgetMatch ? parseFloat(budgetMatch[1].replace(/,/g, '')) : null,
      country: countryMatch ? countryMatch[1] : '未知',
      source: raw.source || 'unknown',
      email: raw.email || null,
      phone: raw.phone || null,
      company: raw.company || null,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * 查找或创建客户
   */
  async findOrCreateCustomer(inquiry) {
    // 尝试通过邮箱查找
    if (inquiry.email) {
      const existing = this.customers.find(c => c.email === inquiry.email);
      if (existing) {
        existing.lastInquiry = inquiry.id;
        existing.inquiryCount = (existing.inquiryCount || 0) + 1;
        this.saveData();
        return existing;
      }
    }
    
    // 创建新客户
    const customer = {
      id: `CUST_${Date.now()}`,
      name: inquiry.company || inquiry.email?.split('@')[0] || 'Unknown',
      company: inquiry.company,
      email: inquiry.email,
      phone: inquiry.phone,
      country: inquiry.country,
      source: inquiry.source,
      tier: 'C', // A/B/C级客户
      value: this.estimateCustomerValue(inquiry),
      inquiryCount: 1,
      firstInquiry: inquiry.id,
      lastInquiry: inquiry.id,
      createdAt: new Date().toISOString(),
      tags: [],
      notes: ''
    };
    
    this.customers.push(customer);
    this.saveData();
    
    return customer;
  }

  /**
   * 评估客户价值
   */
  assessCustomerValue(customer, inquiry) {
    let score = 0;
    
    // 国家因素
    const highValueCountries = ['USA', 'UK', 'Germany', 'Japan', 'Australia'];
    if (highValueCountries.includes(inquiry.country)) score += 30;
    
    // 预算因素
    if (inquiry.budget && inquiry.budget > 10000) score += 30;
    else if (inquiry.budget && inquiry.budget > 5000) score += 20;
    else score += 10;
    
    // 数量因素
    if (inquiry.quantity && inquiry.quantity > 1000) score += 20;
    else if (inquiry.quantity && inquiry.quantity > 100) score += 10;
    
    // 历史因素
    score += (customer.inquiryCount || 0) * 5;
    
    // 客户分级
    let tier = 'C';
    if (score >= 80) tier = 'A';
    else if (score >= 50) tier = 'B';
    
    // 更新客户分级
    if (tier < customer.tier) { // A < B < C
      customer.tier = tier;
    }
    
    return { score, tier };
  }

  /**
   * 估算客户价值
   */
  estimateCustomerValue(inquiry) {
    let value = 0;
    if (inquiry.budget) value += inquiry.budget;
    if (inquiry.quantity) value += inquiry.quantity * 10;
    return value;
  }

  /**
   * 生成报价
   */
  generateQuote(inquiry) {
    const unitPrice = inquiry.budget && inquiry.quantity 
      ? inquiry.budget / inquiry.quantity 
      : 20; // 默认$20
    
    const profit = unitPrice * 0.3; // 30%利润
    const fees = unitPrice * 0.15; // 15%平台费
    
    return {
      id: `QUOTE_${Date.now()}`,
      inquiryId: inquiry.id,
      product: inquiry.product,
      quantity: inquiry.quantity || 100,
      unitPrice: unitPrice.toFixed(2),
      suggestedPrice: (unitPrice + profit).toFixed(2),
      profit: profit.toFixed(2),
      status: 'draft',
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      createdAt: new Date().toISOString()
    };
  }

  /**
   * 确定跟进策略
   */
  determineStrategy(value, inquiry) {
    // A级客户：立即跟进
    if (value.tier === 'A') {
      return {
        priority: 'high',
        responseTime: '1小时内',
        actions: ['立即回复', '电话沟通', 'VIP报价']
      };
    }
    
    // B级客户：当天跟进
    if (value.tier === 'B') {
      return {
        priority: 'medium',
        responseTime: '4小时内',
        actions: ['邮件回复', '发送目录', '添加WhatsApp']
      };
    }
    
    // C级客户：标准跟进
    return {
      priority: 'low',
      responseTime: '24小时内',
      actions: ['邮件回复', '发送报价单']
    };
  }

  /**
   * 生成待办事项
   */
  generateActions(strategy) {
    return strategy.actions.map(action => ({
      action,
      priority: strategy.priority,
      dueAt: this.calculateDueTime(strategy.responseTime)
    }));
  }

  /**
   * 计算截止时间
   */
  calculateDueTime(responseTime) {
    const hours = responseTime.match(/(\d+)/)?.[1] || 24;
    return new Date(Date.now() + parseInt(hours) * 60 * 60 * 1000).toISOString();
  }

  /**
   * 发送报价邮件（Mock）
   */
  sendQuote(inquiryId) {
    const inquiry = this.inquiries.find(i => i.id === inquiryId);
    if (!inquiry) return { error: 'Inquiry not found' };
    
    inquiry.status = 'quoted';
    inquiry.quotedAt = new Date().toISOString();
    this.saveData();
    
    return {
      success: true,
      to: inquiry.email,
      subject: `Re: ${inquiry.product} Inquiry - Quote #${inquiry.quoteId}`
    };
  }

  /**
   * 跟进提醒
   */
  getFollowUps() {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    return this.inquiries
      .filter(i => i.status === 'pending' || i.status === 'quoted')
      .filter(i => {
        const created = new Date(i.createdAt);
        // 3天未跟进或7天未成交
        return (now - created > 3 * 24 * 60 * 60 * 1000) ||
               (i.status === 'quoted' && now - new Date(i.quotedAt) > 7 * 24 * 60 * 60 * 1000);
      })
      .map(i => ({
        ...i,
        customer: this.customers.find(c => c.id === i.customerId),
        daysAgo: Math.floor((now - new Date(i.createdAt)) / (24 * 60 * 60 * 1000))
      }));
  }

  /**
   * 客户列表
   */
  listCustomers(filter = {}) {
    let list = [...this.customers];
    
    if (filter.tier) {
      list = list.filter(c => c.tier === filter.tier);
    }
    
    if (filter.country) {
      list = list.filter(c => c.country === filter.country);
    }
    
    if (filter.search) {
      const s = filter.search.toLowerCase();
      list = list.filter(c => 
        c.name?.toLowerCase().includes(s) ||
        c.company?.toLowerCase().includes(s) ||
        c.email?.toLowerCase().includes(s)
      );
    }
    
    return list.sort((a, b) => (b.value || 0) - (a.value || 0));
  }

  /**
   * 询盘列表
   */
  listInquiries(filter = {}) {
    let list = [...this.inquiries];
    
    if (filter.status) {
      list = list.filter(i => i.status === filter.status);
    }
    
    if (filter.customerId) {
      list = list.filter(i => i.customerId === filter.customerId);
    }
    
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /**
   * 导出客户到CRM格式
   */
  exportToCRM() {
    return this.customers.map(c => ({
      name: c.name,
      company: c.company,
      email: c.email,
      phone: c.phone,
      country: c.country,
      tier: c.tier,
      value: c.value,
      tags: c.tags?.join(',') || ''
    }));
  }
}

module.exports = { CustomerAcquisition };
