/**
 * 选品决策模块 - 供应商匹配
 * 
 * 智能匹配最优供应商
 */

/**
 * 供应商匹配
 */
class SupplierMatcher {
  constructor(config = {}) {
    this.suppliers = config.suppliers || [];
    this.weight = config.weight || {
      price: 0.35,
      quality: 0.25,
      reliability: 0.2,
      location: 0.1,
      service: 0.1
    };
  }

  /**
   * 匹配供应商
   */
  async matchSuppliers(requirements) {
    console.log(`[Selection] Matching suppliers for: ${requirements.product}`);
    
    // 1. 筛选候选
    const candidates = this.findCandidates(requirements);
    
    // 2. 评分
    const scored = this.scoreSuppliers(candidates, requirements);
    
    // 3. 排序
    scored.sort((a, b) => b.totalScore - a.totalScore);
    
    return {
      requirements,
      topMatches: scored.slice(0, 5),
      alternatives: scored.slice(5, 10),
      summary: this.generateSummary(scored),
      recommendations: this.generateRecommendations(scored, requirements),
      matchedAt: new Date().toISOString()
    };
  }

  /**
   * 查找候选供应商
   */
  findCandidates(requirements) {
    if (this.suppliers.length > 0) {
      return this.suppliers.filter(s => {
        const categoryMatch = s.category?.toLowerCase().includes(
          requirements.product?.toLowerCase()
        );
        const moqMatch = !requirements.moq || (s.moq || 100) <= requirements.moq;
        const priceMatch = !requirements.maxPrice || (s.price || 999) <= requirements.maxPrice;
        return categoryMatch && moqMatch && priceMatch;
      });
    }
    
    return this.generateMockSuppliers(requirements);
  }

  /**
   * 生成Mock供应商
   */
  generateMockSuppliers(requirements) {
    const locations = ['China', 'Vietnam', 'India', 'Thailand', 'Taiwan'];
    const suppliers = [];
    
    for (let i = 0; i < 8; i++) {
      suppliers.push({
        id: `sup_${i}`,
        name: `${requirements.product || 'Product'} Factory ${String.fromCharCode(65 + i)}`,
        country: locations[i % locations.length],
        category: requirements.product || 'General',
        price: (Math.random() * 50 + 10).toFixed(2),
        moq: Math.floor(Math.random() * 500) + 100,
        leadTime: Math.floor(Math.random() * 20) + 10,
        rating: (Math.random() * 2 + 3).toFixed(1),
        responseTime: Math.floor(Math.random() * 24) + 1,
        certifications: ['ISO9001', 'CE', 'FDA'].slice(0, Math.floor(Math.random() * 3) + 1),
        samples: Math.random() > 0.5,
        oem: Math.random() > 0.3,
        paymentTerms: ['T/T', 'L/C', 'PayPal'][Math.floor(Math.random() * 3)]
      });
    }
    
    return suppliers;
  }

  /**
   * 评分供应商
   */
  scoreSuppliers(suppliers, requirements) {
    return suppliers.map(supplier => {
      const scores = {
        price: this.scorePrice(supplier, requirements),
        quality: this.scoreQuality(supplier, requirements),
        reliability: this.scoreReliability(supplier, requirements),
        location: this.scoreLocation(supplier, requirements),
        service: this.scoreService(supplier, requirements)
      };
      
      // 计算总分
      const totalScore = Object.entries(scores).reduce((sum, [key, val]) => 
        sum + val * this.weight[key], 0);
      
      return {
        supplier,
        scores,
        totalScore: Math.round(totalScore)
      };
    });
  }

  /**
   * 价格评分
   */
  scorePrice(supplier, requirements) {
    const price = parseFloat(supplier.price) || 50;
    const target = requirements.targetPrice || 30;
    
    if (price <= target * 0.7) return 100;
    if (price <= target) return 80;
    if (price <= target * 1.3) return 60;
    return 40;
  }

  /**
   * 质量评分
   */
  scoreQuality(supplier, requirements) {
    const rating = parseFloat(supplier.rating) || 3;
    const score = (rating / 5) * 100;
    
    // 有认证加分
    const certBonus = (supplier.certifications?.length || 0) * 5;
    
    return Math.min(100, score + certBonus);
  }

  /**
   * 可靠性评分
   */
  scoreReliability(supplier, requirements) {
    let score = 70;
    
    // 响应时间
    const responseTime = supplier.responseTime || 24;
    if (responseTime <= 4) score += 20;
    else if (responseTime <= 12) score += 10;
    
    // 样品支持
    if (supplier.samples) score += 10;
    
    return Math.min(100, score);
  }

  /**
   * 位置评分
   */
  scoreLocation(supplier, requirements) {
    const prefRegion = requirements.preferredRegion || 'China';
    const country = supplier.country || 'China';
    
    if (country.toLowerCase() === prefRegion.toLowerCase()) return 100;
    if (prefRegion === 'Asia' && ['China', 'Vietnam', 'India', 'Thailand'].includes(country)) return 80;
    return 50;
  }

  /**
   * 服务评分
   */
  scoreService(supplier, requirements) {
    let score = 60;
    
    if (supplier.oem) score += 20;
    if (supplier.paymentTerms === 'T/T') score += 10;
    if (supplier.customDesign) score += 10;
    
    return Math.min(100, score);
  }

  /**
   * 生成总结
   */
  generateSummary(scored) {
    const top = scored[0];
    return `Best supplier: ${top.supplier.name} in ${top.supplier.country} (Score: ${top.totalScore})`;
  }

  /**
   * 生成建议
   */
  generateRecommendations(scored, requirements) {
    const recs = [];
    
    if (scored[0].scores.price < 60) {
      recs.push('Negotiate for better pricing');
    }
    
    if (!scored[0].supplier.samples) {
      recs.push('Request samples before bulk order');
    }
    
    if (scored[0].supplier.country !== requirements.preferredRegion) {
      recs.push('Consider suppliers in preferred region for logistics');
    }
    
    return recs;
  }

  /**
   * 比较多个供应商
   */
  compareSuppliers(suppliers, product) {
    return suppliers.map(s => ({
      name: s.name,
      country: s.country,
      price: s.price,
      moq: s.moq,
      leadTime: s.leadTime,
      rating: s.rating,
      totalScore: this.scoreSuppliers([s], {})[0].totalScore
    }));
  }
}

module.exports = { SupplierMatcher };
