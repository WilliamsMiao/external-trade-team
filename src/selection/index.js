/**
 * 选品决策模块
 * 
 * 整合产品匹配、利润计算、供应商匹配
 */

const { ProductMatcher } = require('./product_matcher');
const { ProfitCalculator } = require('./profit_calculator');
const { SupplierMatcher } = require('./supplier_matcher');
const { skill1688_search } = require('../../skills/data_collection/1688_search');
const { skillGoogleTrends } = require('../../skills/data_collection/google_trends');
const { skillProductAnalyze } = require('../../skills/data_processing/product_analyze');

function dedupeSelectionProducts(products = []) {
  const byKey = new Map();
  for (const p of products) {
    const key = p.url || `${p.source}:${p.id || p.name}`;
    const prev = byKey.get(key);
    if (!prev || Number(p.sold || 0) > Number(prev.sold || 0)) {
      byKey.set(key, p);
    }
  }
  return Array.from(byKey.values());
}

module.exports = {
  // 产品匹配
  ProductMatcher,
  
  // 利润计算
  ProfitCalculator,
  
  // 供应商匹配
  SupplierMatcher,
  
  // 完整选品流程
  async runSelectionPipeline(demand, options = {}) {
    console.log('[Selection] Running full pipeline...');
    
    // 1. 产品匹配
    const matcher = new ProductMatcher();
    const productResult = await matcher.matchProducts(demand);
    
    // 2. 供应商匹配（对Top产品）
    const supplierMatcher = new SupplierMatcher();
    const topProducts = productResult.topMatches.slice(0, 3);
    
    const supplierResults = await Promise.all(
      topProducts.map(async (item) => {
        const suppliers = await supplierMatcher.matchSuppliers({
          product: item.product.name,
          moq: item.product.moq
        });
        return {
          product: item.product.name,
          topSupplier: suppliers.topMatches[0]
        };
      })
    );
    
    // 3. 利润计算
    const calculator = new ProfitCalculator(options.profitConfig);
    const profitResults = topProducts.map(item => 
      calculator.calculateProfit(
        item.product,
        options.marketPrice || item.product.basePrice * 2,
        options.volume || 100
      )
    );
    
    // 4. 汇总结果
    return {
      demand,
      products: productResult.topMatches.slice(0, 5),
      suppliers: supplierResults,
      profits: profitResults,
      recommendation: this.generateRecommendation(topProducts, supplierResults, profitResults),
      pipelineComplete: new Date().toISOString()
    };
  },

  // 真实互联网选品流程
  async runInternetSelectionPipeline(demand, options = {}) {
    const keywords = Array.isArray(demand.keywords) ? demand.keywords.filter(Boolean) : [];
    const keyword = keywords[0] || 'wireless earbuds';

    console.log('[Selection] Running internet pipeline...');

    const productSource = await skill1688_search({
      keyword,
      pageSize: options.pageSize || 20,
      page: options.page || 1,
      site: options.site || process.env.MELI_SITE || 'MLA',
    });

    const trends = await skillGoogleTrends({
      keywords: keywords.length ? keywords : [keyword],
      geo: demand.market || options.geo || 'US',
      timeframe: options.timeframe || 'today 3-m',
    });

    let rawResults = Array.isArray(productSource.results) ? productSource.results : [];
    if (rawResults.length === 0) {
      const fallbackKeyword = keyword.includes(' ') ? keyword.split(' ')[0] : 'phone';
      const fallbackSource = await skill1688_search({
        keyword: fallbackKeyword,
        pageSize: options.pageSize || 20,
        page: options.page || 1,
        site: options.site || process.env.MELI_SITE || 'MLA',
      });
      rawResults = Array.isArray(fallbackSource.results) ? fallbackSource.results : [];
      if (rawResults.length > 0) {
        productSource.source = fallbackSource.source || productSource.source;
        productSource.mode = fallbackSource.mode || productSource.mode;
        productSource.total = fallbackSource.total || productSource.total;
        productSource.quality = fallbackSource.quality || productSource.quality;
        if (fallbackSource.error) {
          productSource.error = fallbackSource.error;
        }
      }
    }

    const normalized = rawResults.map((item) => {
      const price = Number(item.price || 0);
      const cost = Number((price * 0.65).toFixed(2));
      return {
        id: item.id || `p_${Date.now()}`,
        name: item.title || keyword,
        price,
        cost,
        source: item.source || productSource.source || 'unknown',
        currency: item.currency || 'USD',
        url: item.permalink || null,
        supplier: item.supplier || 'unknown',
        location: item.location || 'unknown',
        sold: Number(item.sales || 0),
      };
    });

    const dedupedProducts = dedupeSelectionProducts(normalized);

    const analyzed = await skillProductAnalyze({
      products: dedupedProducts.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        cost: p.cost,
        competitorPrice: [p.price * 0.95, p.price * 1.02, p.price * 1.08].map((v) => Number(v.toFixed(2))),
        competitorCount: Math.max(5, Math.round(p.sold / 10)),
        salesHistory: [40, 52, 61, 73, 86, 95].map((v) => Math.max(1, Math.round(v * (p.price > 0 ? 1 : 0.7)))),
        seasonal: false,
      })),
    });

    const marginById = new Map((analyzed.results || []).map((r) => [r.id, Number(r.margin || 0)]));

    const ranked = normalized
      .map((p) => ({
        ...p,
        margin: marginById.get(p.id) || Number((((p.price - p.cost) / Math.max(p.price, 1)) * 100).toFixed(1)),
      }))
      .sort((a, b) => (b.margin * 0.7 + b.sold * 0.01) - (a.margin * 0.7 + a.sold * 0.01));

    const rankedDeduped = dedupeSelectionProducts(ranked);

    const requiredFields = ['name', 'price', 'currency', 'source', 'url'];
    const structuredCount = rankedDeduped.filter((p) =>
      requiredFields.every((f) => p[f] !== undefined && p[f] !== null && String(p[f]).length > 0)
    ).length;
    const structuredRate = rankedDeduped.length > 0 ? Number((structuredCount / rankedDeduped.length).toFixed(3)) : 0;
    const qualityGate = {
      minRecordsOk: rankedDeduped.length >= Number(options.minRecords || 3),
      structuredRate,
      structuredRateOk: structuredRate >= Number(options.minStructuredRate || 0.8),
      sourceValidationOk: Boolean(productSource.quality?.pass ?? true),
    };

    return {
      demand,
      source: {
        mode: productSource.mode || 'unknown',
        provider: productSource.source || 'unknown',
        totalFetched: productSource.total || rankedDeduped.length,
        quality: productSource.quality || null,
        error: productSource.error || null,
      },
      trends,
      products: rankedDeduped.slice(0, 10),
      quality: {
        ...qualityGate,
        pass: qualityGate.minRecordsOk && qualityGate.structuredRateOk && qualityGate.sourceValidationOk,
      },
      recommendation: rankedDeduped[0]
        ? {
            product: rankedDeduped[0],
            margin: rankedDeduped[0].margin,
            roi: Number((rankedDeduped[0].margin / 100 / 0.65).toFixed(2)),
            action: rankedDeduped[0].margin >= 25 ? 'PROCEED' : 'REVIEW',
          }
        : null,
      pipelineComplete: new Date().toISOString(),
    };
  },
  
  generateRecommendation(products, suppliers, profits) {
    // 找最优解
    const bestProfit = profits.reduce((best, curr) => 
      parseFloat(curr.profit.margin) > parseFloat(best.profit.margin) ? curr : best, profits[0]);
    
    return {
      product: bestProfit.product,
      supplier: suppliers[0]?.topSupplier?.supplier,
      salePrice: bestProfit.salePrice,
      margin: bestProfit.profit.margin,
      roi: bestProfit.profit.roi,
      action: parseFloat(bestProfit.profit.margin) > 30 ? 'PROCEED' : 'NEGOTIATE'
    };
  }
};
