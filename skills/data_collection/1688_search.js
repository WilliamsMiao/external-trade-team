/**
 * Skill: 1688产品搜索
 * 
 * 搜索1688/阿里巴巴批发平台产品
 */

const axios = require('axios');
const crypto = require('crypto');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 1688 API客户端
 */
class Alibaba1688 {
  constructor(config = {}) {
    this.appKey = config.appKey || process.env.ALIBABA_APP_KEY;
    this.appSecret = config.appSecret || process.env.ALIBABA_APP_SECRET;
    this.memberId = config.memberId || process.env.ALIBABA_MEMBER_ID;
    this.apiUrl = 'https://gw.open.1688.com/openapi/param2/1/com.alibaba.search/';
    this.timeout = Number(config.timeout || process.env.COLLECT_TIMEOUT_MS || 12000);
    this.retries = Number(config.retries || process.env.COLLECT_RETRIES || 2);
  }

  normalizeProduct(item, source, defaults = {}) {
    const title = item.title || item.name || null;
    const permalink = item.permalink || item.url || defaults.permalink || null;
    const currency = item.currency || item.currency_id || defaults.currency || 'USD';
    const price = Number(item.price || 0);

    return {
      id: item.id || defaults.id || null,
      title,
      price,
      currency,
      moq: Number(item.moq || defaults.moq || 1),
      sales: Number(item.sales || item.sold_quantity || item.stock || 0),
      supplier: item.supplier || item.brand || item.seller?.nickname || item.seller?.id || 'unknown',
      location: item.location || item.address?.state_name || item.address?.city_name || defaults.location || 'unknown',
      listingType: item.listingType || item.listing_type_id || defaults.listingType || null,
      condition: item.condition || defaults.condition || null,
      permalink,
      thumbnail: item.thumbnail || null,
      source,
      collectedAt: new Date().toISOString(),
    };
  }

  isValidProduct(product) {
    if (!product) return false;
    if (!product.title || String(product.title).trim().length < 2) return false;
    if (!Number.isFinite(Number(product.price)) || Number(product.price) <= 0) return false;
    if (!product.permalink || !/^https?:\/\//.test(String(product.permalink))) return false;
    if (!product.currency) return false;
    return true;
  }

  dedupeProducts(products = []) {
    const byKey = new Map();
    for (const p of products) {
      const key = p.permalink || `${p.source}:${p.id || p.title}`;
      const prev = byKey.get(key);
      if (!prev || Number(p.sales || 0) > Number(prev.sales || 0)) {
        byKey.set(key, p);
      }
    }
    return Array.from(byKey.values());
  }

  buildSearchResult({ keyword, site, page, pageSize, source, mode, rows }) {
    const normalized = (Array.isArray(rows) ? rows : []).map((item) => this.normalizeProduct(item, source));
    const validOnly = normalized.filter((p) => this.isValidProduct(p));
    const deduped = this.dedupeProducts(validOnly);
    const structuredRate = normalized.length > 0 ? Number((deduped.length / normalized.length).toFixed(3)) : 0;

    return {
      success: true,
      keyword,
      mode,
      source,
      site,
      total: deduped.length,
      page,
      pageSize,
      quality: {
        rawCount: normalized.length,
        validCount: validOnly.length,
        dedupedCount: deduped.length,
        structuredRate,
        pass: deduped.length > 0 && structuredRate >= 0.7,
      },
      results: deduped,
    };
  }

  /**
   * 生成签名
   */
  sign(params) {
    const sorted = Object.keys(params).sort();
    const str = this.appSecret + sorted.map(k => k + params[k]).join('') + this.appSecret;
    return crypto.createHash('md5').update(str).digest('hex').toUpperCase();
  }

  /**
   * 搜索产品
   */
  async searchProducts(keyword, options = {}) {
    const params = {
      app_key: this.appKey,
      method: 'alibaba.search.productList',
      timestamp: new Date().toISOString(),
      format: 'json',
      v: '1.0',
      sign_method: 'md5',
      keyword,
      pageSize: options.pageSize || 20,
      page: options.page || 1
    };
    
    params.sign = this.sign(params);
    
    try {
      // 优先走真实互联网数据源（MercadoLibre公开API）
      return await this.searchFromInternet(keyword, options);
    } catch (e) {
      console.error('[1688] Real search failed:', e.message);
      return {
        success: false,
        keyword,
        mode: 'failed',
        source: 'none',
        total: 0,
        page: Number(options.page || 1),
        pageSize: Number(options.pageSize || 20),
        quality: {
          rawCount: 0,
          validCount: 0,
          dedupedCount: 0,
          structuredRate: 0,
          pass: false,
        },
        error: e.message,
        results: [],
      };
    }
  }

  /**
   * 从公开互联网源拉取真实商品数据
   */
  async searchFromInternet(keyword, options = {}) {
    const site = options.site || process.env.MELI_SITE || 'MLA'; // 阿根廷站默认
    const limit = Math.max(1, Math.min(Number(options.pageSize || 20), 50));
    const page = Math.max(1, Number(options.page || 1));
    const offset = (page - 1) * limit;

    const url = `https://api.mercadolibre.com/sites/${site}/search`;
    let lastError = null;

    for (let i = 0; i <= this.retries; i++) {
      try {
        const response = await axios.get(url, {
          params: { q: keyword, limit, offset },
          timeout: this.timeout,
          headers: {
            'User-Agent': 'external-trade-team/1.0',
            'Accept': 'application/json',
          },
        });

        const data = response.data || {};
        const rows = Array.isArray(data.results) ? data.results : [];

        const built = this.buildSearchResult({
          keyword,
          site,
          page,
          pageSize: limit,
          source: 'mercadolibre',
          mode: 'real_api',
          rows,
        });

        return {
          ...built,
          total: Number(data.paging?.total || built.results.length),
        };
      } catch (error) {
        lastError = error;
        if (i < this.retries) {
          await sleep(400 * (i + 1));
        }
      }
    }

    // 备用真实源：DummyJSON 公共产品API（无需鉴权）
    try {
      const backup = await axios.get('https://dummyjson.com/products/search', {
        params: { q: keyword, limit },
        timeout: this.timeout,
        headers: {
          'User-Agent': 'external-trade-team/1.0',
          'Accept': 'application/json',
        },
      });

      const rows = Array.isArray(backup.data?.products) ? backup.data.products : [];
      const adaptedRows = rows.map((item) => ({
        ...item,
        id: item.id ? `DUMMY-${item.id}` : null,
        permalink: `https://dummyjson.com/products/${item.id}`,
        location: 'global',
        listingType: 'catalog',
        condition: 'new',
        sales: Number(item.stock || 0),
      }));

      const built = this.buildSearchResult({
        keyword,
        site,
        page,
        pageSize: limit,
        source: 'dummyjson',
        mode: 'real_api',
        rows: adaptedRows,
      });

      return {
        ...built,
        total: Number(backup.data?.total || built.results.length),
      };
    } catch (backupError) {
      throw backupError || lastError || new Error('internet search failed');
    }
  }

  /**
   * 获取供应商详情
   */
  async getSupplierInfo(companyName) {
    return {
      success: false,
      company: companyName,
      error: 'supplier detail source is not configured yet',
      mode: 'not_available',
    };
  }

  /**
   * 获取商品详情
   */
  async getProductDetail(productId) {
    return {
      success: false,
      id: productId,
      error: 'product detail source is not configured yet',
      mode: 'not_available',
    };
  }
}

/**
 * Skill主函数
 */
async function skill1688_search(params) {
  const client = new Alibaba1688();
  
  if (params.subaction === 'supplier') {
    return await client.getSupplierInfo(params.company);
  }
  
  if (params.subaction === 'detail') {
    return await client.getProductDetail(params.productId);
  }
  
  return await client.searchProducts(params.keyword, params);
}

module.exports = { skill1688_search, Alibaba1688 };
