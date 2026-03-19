/**
 * 选品决策模块 - 产品匹配
 * 
 * 根据需求匹配最优产品
 */

const fs = require('fs-extra');

/**
 * 产品匹配
 */
class ProductMatcher {
  constructor(config = {}) {
    this.products = config.products || [];
    this.suppliers = config.suppliers || [];
  }

  /**
   * 根据需求匹配产品
   */
  async matchProducts(demand, options = {}) {
    console.log(`[Selection] Matching products for: ${demand.keywords.join(', ')}`);
    
    // 1. 筛选候选产品
    const candidates = await this.findCandidates(demand);
    
    // 2. 评分
    const scored = await this.scoreCandidates(candidates, demand);
    
    // 3. 排序
    scored.sort((a, b) => b.totalScore - a.totalScore);
    
    // 4. 返回最佳匹配
    return {
      demand: demand,
      topMatches: scored.slice(0, options.limit || 10),
      alternatives: scored.slice(options.limit || 10, 20),
      summary: this.generateSummary(scored),
      recommendations: this.generateRecommendations(scored, demand),
      matchedAt: new Date().toISOString()
    };
  }

  /**
   * 查找候选产品
   */
  async findCandidates(demand) {
    const keywords = demand.keywords || [];
    
    // 如果有产品数据，从数据库筛选
    if (this.products.length > 0) {
      return this.products.filter(p => 
        keywords.some(kw => 
          p.name.toLowerCase().includes(kw.toLowerCase()) ||
          p.category.toLowerCase().includes(kw.toLowerCase())
        )
      );
    }
    
    // 否则返回Mock数据
    return this.generateMockProducts(keywords);
  }

  /**
   * 生成Mock产品
   */
  generateMockProducts(keywords) {
    const categories = ['Electronics', 'Home & Garden', 'Sports', 'Toys', 'Fashion'];
    return keywords.flatMap(kw => 
      categories.slice(0, 3).map(cat => ({
        id: `prod_${Math.random().toString(36).substr(2, 9)}`,
        name: `${cat} ${kw} Pro`,
        category: cat,
        keywords: [kw, `${kw} 2026`, `best ${kw}`],
        basePrice: Math.random() * 100 + 20,
        moq: Math.floor(Math.random() * 500) + 100,
        leadTime: Math.floor(Math.random() * 20) + 7,
        supplierRating: (Math.random() * 2 + 3).toFixed(1),
        marketDemand: Math.floor(Math.random() * 100)
      }))
    );
  }

  /**
   * 评分候选产品
   */
  async scoreCandidates(candidates, demand) {
    const scored = [];
    
    for (const product of candidates) {
      const scores = {
        keywordMatch: this.scoreKeywordMatch(product, demand.keywords),
        priceScore: this.scorePrice(product, demand.budget),
        demandScore: this.scoreDemand(product, demand),
        competitionScore: this.scoreCompetition(product),
        supplierScore: this.scoreSupplier(product),
        profitScore: this.scoreProfit(product, demand.targetMargin)
      };
      
      // 计算总分（加权）
      const weights = { keywordMatch: 0.25, priceScore: 0.15, demandScore: 0.25, competitionScore: 0.15, supplierScore: 0.1, profitScore: 0.1 };
      const totalScore = Object.entries(scores).reduce((sum, [key, val]) => 
        sum + val * weights[key], 0);
      
      scored.push({
        product,
        scores,
        totalScore: Math.round(totalScore)
      });
    }
    
    return scored;
  }

  /**
   * 关键词匹配评分
   */
  scoreKeywordMatch(product, keywords) {
    const matchCount = keywords.filter(kw => 
      product.name.toLowerCase().includes(kw.toLowerCase()) ||
      product.category.toLowerCase().includes(kw.toLowerCase())
    ).length;
    return Math.min(100, matchCount * 25);
  }

  /**
   * 价格评分
   */
  scorePrice(product, budget) {
    if (!budget) return 70;
    const ratio = product.basePrice / budget;
    return ratio <= 0.7 ? 100 : ratio <= 1 ? 80 : 50;
  }

  /**
   * 需求评分
   */
  scoreDemand(product, demand) {
    return product.marketDemand || 50;
  }

  /**
   * 竞争评分
   */
  scoreCompetition(product) {
    // Mock竞争分析
    return Math.floor(Math.random() * 40) + 60;
  }

  /**
   * 供应商评分
   */
  scoreSupplier(product) {
    return (parseFloat(product.supplierRating) || 3) * 20;
  }

  /**
   * 利润评分
   */
  scoreProfit(product, targetMargin) {
    const estimatedMargin = 0.3; // 假设30%利润率
    if (!targetMargin) return 70;
    return estimatedMargin >= targetMargin ? 100 : 60;
  }

  /**
   * 生成总结
   */
  generateSummary(scored) {
    const top = scored[0];
    return `Best match: ${top.product.name} (Score: ${top.totalScore})`;
  }

  /**
   * 生成建议
   */
  generateRecommendations(scored, demand) {
    const recs = [];
    
    if (scored[0].scores.demandScore < 50) {
      recs.push('Consider products with higher market demand');
    }
    
    if (scored[0].scores.competitionScore < 60) {
      recs.push('High competition - consider differentiation');
    }
    
    return recs;
  }
}

module.exports = { ProductMatcher };
