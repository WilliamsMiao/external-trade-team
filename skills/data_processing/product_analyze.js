/**
 * Skill: 产品分析
 * 
 * 分析产品数据，提供选品建议
 */

const fs = require('fs-extra');
const path = require('path');

/**
 * 产品分析器
 */
class ProductAnalyzer {
  constructor(config = {}) {
    this.dataDir = config.dataDir || './data';
  }

  /**
   * 分析产品
   */
  async analyzeProduct(productData) {
    const analysis = {
      id: productData.id || `prod_${Date.now()}`,
      name: productData.name,
      
      // 基础指标
      price: productData.price,
      cost: productData.cost,
      margin: ((productData.price - productData.cost) / productData.price * 100).toFixed(1),
      
      // 竞争分析
      competition: this.analyzeCompetition(productData),
      
      // 趋势分析
      trend: this.analyzeTrend(productData),
      
      // 风险评估
      risk: this.assessRisk(productData),
      
      // 建议
      recommendation: this.generateRecommendation(productData),
      
      analyzedAt: new Date().toISOString()
    };

    return analysis;
  }

  /**
   * 竞争分析
   */
  analyzeCompetition(product) {
    const competitors = product.competitorPrice || [];
    
    if (competitors.length === 0) {
      return { level: 'unknown', summary: '暂无竞争数据' };
    }

    const avgCompetitor = competitors.reduce((a, b) => a + b, 0) / competitors.length;
    const myPrice = product.price;
    
    let level, summary;
    if (myPrice < avgCompetitor * 0.9) {
      level = 'low';
      summary = '价格优势明显';
    } else if (myPrice < avgCompetitor * 1.1) {
      level = 'medium';
      summary = '价格适中';
    } else {
      level = 'high';
      summary: '价格偏高';
    }

    return { level, summary, avgCompetitorPrice: avgCompetitor.toFixed(2) };
  }

  /**
   * 趋势分析
   */
  analyzeTrend(product) {
    const history = product.salesHistory || [];
    
    if (history.length < 3) {
      return { direction: 'unknown', summary: '数据不足' };
    }

    // 简单趋势计算
    const recent = history.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const older = history.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const change = ((recent - older) / older * 100);

    let direction;
    if (change > 20) direction = 'rising';
    else if (change < -20) direction = 'declining';
    else direction = 'stable';

    return {
      direction,
      changePercent: change.toFixed(1),
      summary: direction === 'rising' ? '上升趋势' : direction === 'declining' ? '下降趋势' : '稳定'
    };
  }

  /**
   * 风险评估
   */
  assessRisk(product) {
    const risks = [];
    let score = 0;

    // 利润风险
    const margin = (product.price - product.cost) / product.price;
    if (margin < 0.2) {
      risks.push({ type: 'profit', level: 'high', message: '利润率过低' });
      score += 30;
    } else if (margin < 0.3) {
      risks.push({ type: 'profit', level: 'medium', message: '利润率一般' });
      score += 15;
    }

    // 竞争风险
    if (product.competitorCount > 50) {
      risks.push({ type: 'competition', level: 'high', message: '竞争激烈' });
      score += 25;
    }

    // 季节性风险
    if (product.seasonal) {
      risks.push({ type: 'seasonal', level: 'medium', message: '有季节性波动' });
      score += 10;
    }

    return {
      score,
      level: score > 50 ? 'high' : score > 25 ? 'medium' : 'low',
      factors: risks
    };
  }

  /**
   * 生成建议
   */
  generateRecommendation(product) {
    const recommendation = { action: 'PROCEED', reasons: [] };

    // 基于风险
    const risk = this.assessRisk(product);
    if (risk.level === 'high') {
      recommendation.action = 'REVIEW';
      recommendation.reasons.push('风险较高，需人工审核');
    }

    // 基于趋势
    const trend = this.analyzeTrend(product);
    if (trend.direction === 'rising') {
      recommendation.reasons.push('市场上升趋势');
    } else if (trend.direction === 'declining') {
      recommendation.action = 'REVIEW';
      recommendation.reasons.push('市场下降趋势');
    }

    // 基于利润
    const margin = (product.price - product.cost) / product.price;
    if (margin > 0.4) {
      recommendation.reasons.push('利润空间充足');
    }

    return recommendation;
  }

  /**
   * 批量分析
   */
  async analyzeBatch(products) {
    const results = [];
    for (const product of products) {
      results.push(await this.analyzeProduct(product));
    }
    
    // 排序推荐
    results.sort((a, b) => {
      if (a.recommendation.action === 'PROCEED' && b.recommendation.action !== 'PROCEED') return -1;
      if (b.recommendation.action === 'PROCEED' && a.recommendation.action !== 'PROCEED') return 1;
      return parseFloat(b.margin) - parseFloat(a.margin);
    });

    return {
      total: products.length,
      recommended: results.filter(r => r.recommendation.action === 'PROCEED').length,
      review: results.filter(r => r.recommendation.action === 'REVIEW').length,
      results
    };
  }
}

/**
 * Skill主函数
 */
async function skillProductAnalyze(params) {
  const analyzer = new ProductAnalyzer();
  
  if (params.products) {
    return await analyzer.analyzeBatch(params.products);
  }
  
  return await analyzer.analyzeProduct(params.product);
}

module.exports = { skillProductAnalyze, ProductAnalyzer };
