/**
 * 获客模块 - 客户开发与管理
 * 
 * 询盘处理 → 客户管理 → CRM集成 → 自动跟进
 */

const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
   * 互联网获客：基于公开搜索结果发现潜在客户
   */
  async discoverLeadsOnline(query, options = {}) {
    const maxResults = Math.max(1, Math.min(Number(options.maxResults || 10), 30));
    const timeout = Number(options.timeout || process.env.COLLECT_TIMEOUT_MS || 12000);
    const retries = Number(options.retries || process.env.COLLECT_RETRIES || 2);
    const enrichTopN = Math.max(0, Math.min(Number(options.enrichTopN ?? 3), maxResults));
    const url = 'https://html.duckduckgo.com/html/';

    let lastError = null;
    for (let i = 0; i <= retries; i++) {
      try {
        const response = await axios.get(url, {
          params: { q: query },
          timeout,
          headers: {
            'User-Agent': 'Mozilla/5.0 (external-trade-team lead discovery)',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });

        const $ = cheerio.load(response.data || '');
        const rows = [];

        $('.result').each((_, el) => {
          if (rows.length >= maxResults) return;
          const title = $(el).find('.result__a').first().text().trim();
          const href = $(el).find('.result__a').first().attr('href') || '';
          const normalizedUrl = this.normalizeResultUrl(href);
          const snippet = $(el).find('.result__snippet').first().text().trim();

          if (!title || !normalizedUrl) return;

          const domainMatch = normalizedUrl.match(/https?:\/\/([^/?#]+)/i);
          const domain = domainMatch ? domainMatch[1].toLowerCase() : 'unknown';

          const score = this.scoreLead({ title, snippet, domain, query });
          rows.push({
            id: `LEAD_${Date.now()}_${rows.length + 1}`,
            company: this.extractCompanyName(title, domain),
            title,
            url: normalizedUrl,
            domain,
            snippet,
            source: 'duckduckgo',
            score,
            qualified: score >= 60,
            collectedAt: new Date().toISOString(),
          });
        });

        const deduped = this.dedupeLeads(rows).sort((a, b) => b.score - a.score).slice(0, maxResults);
        const leads = await this.enrichLeadContacts(deduped, { topN: enrichTopN, timeout, retries: 1 });
        const required = ['company', 'url', 'domain', 'snippet', 'score'];
        const structuredCount = leads.filter((l) =>
          required.every((f) => l[f] !== undefined && l[f] !== null && String(l[f]).length > 0)
        ).length;
        const contactCount = leads.filter((l) => (l.emails && l.emails.length > 0) || (l.phones && l.phones.length > 0)).length;

        return {
          success: true,
          mode: 'real_web',
          query,
          total: leads.length,
          qualified: leads.filter((l) => l.qualified).length,
          structuredRate: leads.length > 0 ? Number((structuredCount / leads.length).toFixed(3)) : 0,
          contactCoverage: leads.length > 0 ? Number((contactCount / leads.length).toFixed(3)) : 0,
          leads,
        };
      } catch (error) {
        lastError = error;
        if (i < retries) {
          await sleep(400 * (i + 1));
        }
      }
    }

    return {
      success: false,
      mode: 'failed',
      query,
      total: 0,
      qualified: 0,
      error: lastError ? lastError.message : 'lead discovery failed',
      leads: [],
    };
  }

  dedupeLeads(leads = []) {
    const byDomain = new Map();
    for (const lead of leads) {
      const key = lead.domain || lead.url || lead.id;
      if (!key) continue;
      const prev = byDomain.get(key);
      if (!prev || Number(lead.score || 0) > Number(prev.score || 0)) {
        byDomain.set(key, lead);
      }
    }
    return Array.from(byDomain.values());
  }

  async enrichLeadContacts(leads = [], options = {}) {
    const topN = Math.max(0, Math.min(Number(options.topN || 0), leads.length));
    if (topN === 0) return leads;

    const enriched = [...leads];
    for (let i = 0; i < topN; i++) {
      const lead = enriched[i];
      const contacts = await this.fetchLeadContacts(lead.url, options);
      const hasContacts = contacts.emails.length > 0 || contacts.phones.length > 0;
      const scoreBoost = hasContacts ? 8 : 0;
      const nextScore = Math.max(0, Math.min(100, Number(lead.score || 0) + scoreBoost));
      enriched[i] = {
        ...lead,
        emails: contacts.emails,
        phones: contacts.phones,
        contactScore: hasContacts ? 1 : 0,
        score: nextScore,
        qualified: nextScore >= 60,
      };
    }
    return enriched.sort((a, b) => b.score - a.score);
  }

  async fetchLeadContacts(url, options = {}) {
    if (!url) return { emails: [], phones: [] };

    const timeout = Number(options.timeout || process.env.COLLECT_TIMEOUT_MS || 12000);
    const retries = Math.max(0, Number(options.retries || 0));
    let lastError = null;

    for (let i = 0; i <= retries; i++) {
      try {
        const response = await axios.get(url, {
          timeout,
          maxRedirects: 3,
          headers: {
            'User-Agent': 'Mozilla/5.0 (external-trade-team contact enrichment)',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });

        const html = String(response.data || '');
        return {
          emails: this.extractEmails(html).slice(0, 3),
          phones: this.extractPhones(html).slice(0, 3),
        };
      } catch (error) {
        lastError = error;
        if (i < retries) {
          await sleep(250 * (i + 1));
        }
      }
    }

    if (process.env.DEBUG_LEAD_ENRICH === '1' && lastError) {
      console.warn(`[Acquisition] contact enrichment failed for ${url}: ${lastError.message}`);
    }
    return { emails: [], phones: [] };
  }

  extractEmails(html = '') {
    const found = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    return Array.from(new Set(found.map((v) => String(v).toLowerCase())));
  }

  extractPhones(html = '') {
    const compact = String(html).replace(/<[^>]+>/g, ' ');
    const found = compact.match(/\+?\d[\d\s().-]{6,}\d/g) || [];
    return Array.from(
      new Set(
        found
          .map((v) => v.trim())
          .filter((v) => {
            const digits = v.replace(/\D/g, '');
            if (digits.length < 8 || digits.length > 16) return false;
            if (/^(\d)\1+$/.test(digits)) return false;
            if (/^0+$/.test(digits)) return false;
            if (/0{5,}/.test(digits)) return false;
            return true;
          })
      )
    );
  }

  normalizeResultUrl(url) {
    if (!url) return null;
    let next = url;

    if (next.startsWith('//')) {
      next = `https:${next}`;
    }

    try {
      const parsed = new URL(next);
      const redirectTarget = parsed.searchParams.get('uddg');
      if (redirectTarget) {
        return decodeURIComponent(redirectTarget);
      }
      return parsed.toString();
    } catch {
      return null;
    }
  }

  scoreLead({ title, snippet, domain, query }) {
    const text = `${title} ${snippet} ${domain}`.toLowerCase();
    let score = 20;

    const positive = ['import', 'distributor', 'wholesale', 'supplier', 'trading', 'buyer', 'procurement', 'b2b'];
    const negative = ['wikipedia', 'youtube', 'facebook', 'instagram', 'reddit', 'news'];

    for (const k of positive) {
      if (text.includes(k)) score += 12;
    }
    for (const k of negative) {
      if (text.includes(k)) score -= 10;
    }

    if (query && text.includes(String(query).split(' ')[0]?.toLowerCase())) score += 8;
    return Math.max(0, Math.min(100, score));
  }

  extractCompanyName(title, domain) {
    const cleaned = title
      .replace(/\s*[-|–].*$/, '')
      .replace(/\b(official|homepage|home)\b/gi, '')
      .trim();
    if (cleaned) return cleaned;
    return domain.split('.').slice(0, -1).join('.') || domain;
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
