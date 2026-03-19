/**
 * 选品决策模块 - 增强版
 * 
 * 智能选品：需求分析 → 产品匹配 → 供应商 → 利润
 */

const fs = require('fs-extra');
const path = require('path');

/**
 * 选品管理器
 */
class ProductSelector {
  constructor(config = {}) {
    this.dataDir = config.dataDir || './data';
    this.products = [];
    this.suppliers = [];
    this.customers = [];
    this.loadData();
  }

  /**
   * 加载数据
   */
  loadData() {
    try {
      // 加载产品
      const productsFile = path.join(this.dataDir, 'products.json');
      if (fs.existsSync(productsFile)) {
        this.products = JSON.parse(fs.readFileSync(productsFile, 'utf8'));
      }
      
      // 加载供应商
      const suppliersFile = path.join(this.dataDir, 'suppliers.json');
      if (fs.existsSync(suppliersFile)) {
        this.suppliers = JSON.parse(fs.readFileSync(suppliersFile, 'utf8'));
      }
      
      // 加载历史选品
      const historyFile = path.join(this.dataDir, 'selection_history.json');
      if (fs.existsSync(historyFile)) {
        this.history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
      } else {
        this.history = [];
      }
    } catch (e) {
      console.log('[Selection] Using empty data');
    }
  }

  /**
   * 保存数据
   */
  saveData() {
    fs.ensureDirSync(this.dataDir);
    fs.writeFileSync(
      path.join(this.dataDir, 'selection_history.json'),
      JSON.stringify(this.history, null, 2)
    );
  }

  /**
   * 主选品流程
   */
  async selectProducts(demand) {
    console.log('[Selection] Starting product selection...');
    
    // Step 1: 需求分析
    const analyzedDemand = this.analyzeDemand(demand);
    
    // Step 2: 筛选候选产品
    const candidates = this.filterProducts(analyzedDemand);
    
    // Step 3: 匹配供应商
    const withSuppliers = await this.matchSuppliers(candidates);
    
    // Step 4: 计算利润
    const withProfits = this.calculateProfits(withSuppliers, demand.targetPrice);
    
    // Step 5: 评分排序
    const ranked = this.rankProducts(withProfits, analyzedDemand);
    
    // Step 6: 保存历史
    this.saveSelection(analyzedDemand, ranked);
    
    return {
      demand: analyzedDemand,
      recommendations: ranked.slice(0, 5),
      alternatives: ranked.slice(5, 10),
      summary: this.generateSummary(ranked),
      savedAt: new Date().toISOString()
    };
  }

  /**
   * 需求分析
   */
  analyzeDemand(demand) {
    // 从关键词提取需求
    const keywords = demand.keywords || [];
    const budget = demand.budget || 10000;
    const quantity = demand.quantity || 100;
    const targetMarket = demand.market || 'global';
    const priceRange = demand.priceRange || { min: budget * 0.5 / quantity, max: budget / quantity };
    
    return {
      keywords,
      budget,
      quantity,
      targetMarket,
      priceRange,
      margin: demand.margin || 0.3,
      risk: demand.risk || 'medium'
    };
  }

  /**
   * 筛选产品
   */
  filterProducts(demand) {
    let candidates = [...this.products];
    
    // 按关键词筛选
    if (demand.keywords.length > 0) {
      candidates = candidates.filter(p => 
        demand.keywords.some(kw => 
          p.name.toLowerCase().includes(kw.toLowerCase()) ||
          p.category?.toLowerCase().includes(kw.toLowerCase()) ||
          p.tags?.some(t => kw.toLowerCase().includes(t.toLowerCase()))
        )
      );
    }
    
    // 按价格筛选
    candidates = candidates.filter(p => 
      p.price >= demand.priceRange.min && p.price <= demand.priceRange.max
    );
    
    // 如果没有匹配，返回推荐产品
    if (candidates.length === 0) {
      return this.getRecommendedProducts(demand);
    }
    
    return candidates;
  }

  /**
   * 推荐产品（基于趋势）
   */
  getRecommendedProducts(demand) {
    const trending = [
      { name: '无线充电器', category: 'Electronics', price: 25, cost: 12, margin: 0.52, trend: 'rising', score: 95 },
      { name: '智能手表带', category: 'Fashion', price: 15, cost: 6, margin: 0.6, trend: 'rising', score: 92 },
      { name: 'LED化妆镜', category: 'Beauty', price: 35, cost: 18, margin: 0.49, trend: 'stable', score: 88 },
      { name: '蓝牙音响', category: 'Electronics', price: 45, cost: 22, margin: 0.51, trend: 'rising', score: 90 },
      { name: '运动水壶', category: 'Sports', price: 20, cost: 8, margin: 0.6, trend: 'stable', score: 85 },
    ];
    
    return trending.slice(0, 5).map((p, i) => ({
      ...p,
      id: `rec_${i}`,
      source: 'trending'
    }));
  }

  /**
   * 匹配供应商
   */
  async matchSuppliers(products) {
    return products.map(product => {
      // 筛选该产品的供应商
      const relevantSuppliers = this.suppliers.filter(s => 
        s.categories?.includes(product.category) || s.products?.includes(product.name)
      );
      
      if (relevantSuppliers.length > 0) {
        // 按价格排序取最优
        relevantSuppliers.sort((a, b) => a.price - b.price);
        return {
          ...product,
          supplier: relevantSuppliers[0],
          supplierPrice: relevantSuppliers[0].price,
          supplierMoq: relevantSuppliers[0].moq || 100
        };
      }
      
      // 没有已知供应商，生成估算
      return {
        ...product,
        supplier: { name: '待确认供应商', rating: 4.0 },
        supplierPrice: product.cost || product.price * 0.5,
        supplierMoq: 100
      };
    });
  }

  /**
   * 计算利润
   */
  calculateProfits(products, targetPrice) {
    return products.map(product => {
      const salePrice = targetPrice || product.price;
      const costPrice = product.supplierPrice || product.cost || product.price * 0.5;
      const unitProfit = salePrice - costPrice;
      const profitMargin = unitProfit / salePrice;
      
      // 估算费用
      const fees = salePrice * 0.15; // 平台费15%
      const shipping = 5; // 运费
      const packaging = 1; // 包装
      const ads = salePrice * 0.1; // 广告10%
      
      const netProfit = unitProfit - fees - shipping - packaging - ads;
      const netMargin = netProfit / salePrice;
      const roi = netProfit / costPrice;
      
      return {
        ...product,
        salePrice,
        costPrice,
        grossProfit: unitProfit,
        grossMargin: profitMargin,
        netProfit,
        netMargin,
        roi,
        fees,
        isViable: netMargin >= 0.2 // 20%净利润为底线
      };
    });
  }

  /**
   * 评分排序
   */
  rankProducts(products, demand) {
    return products.map(product => {
      // 评分权重
      const scores = {
        profit: Math.min(100, product.netMargin * 200), // 净利润率
        demand: product.score || 70, // 市场需求
        competition: product.competition === 'low' ? 90 : product.competition === 'medium' ? 70 : 50, // 竞争度
        trend: product.trend === 'rising' ? 100 : product.trend === 'stable' ? 75 : 50, // 趋势
        supplier: (product.supplier?.rating || 4) * 20, // 供应商评分
        risk: demand.risk === 'low' ? 100 : demand.risk === 'medium' ? 75 : 50 // 风险
      };
      
      // 综合评分
      const totalScore = 
        scores.profit * 0.3 +
        scores.demand * 0.25 +
        scores.trend * 0.15 +
        scores.supplier * 0.1 +
        scores.risk * 0.1 +
        scores.competition * 0.1;
      
      return {
        ...product,
        scores,
        totalScore: Math.round(totalScore)
      };
    }).sort((a, b) => b.totalScore - a.totalScore);
  }

  /**
   * 生成总结
   */
  generateSummary(ranked) {
    const top = ranked[0];
    if (!top) return '无推荐产品';
    
    return `最佳选择: ${top.name} (评分: ${top.totalScore})
利润: $${top.netProfit.toFixed(2)}/件 (利润率: ${(top.netMargin * 100).toFixed(1)}%)
趋势: ${top.trend || '稳定'} | 供应商: ${top.supplier?.name || '待确认'}`;
  }

  /**
   * 保存选品记录
   */
  saveSelection(demand, results) {
    this.history.push({
      id: `SEL_${Date.now()}`,
      demand,
      topPick: results[0]?.name,
      topScore: results[0]?.totalScore,
      timestamp: new Date().toISOString()
    });
    this.saveData();
  }

  /**
   * 添加产品到数据库
   */
  addProduct(product) {
    this.products.push({
      ...product,
      id: `prod_${Date.now()}`,
      createdAt: new Date().toISOString()
    });
    fs.ensureDirSync(this.dataDir);
    fs.writeFileSync(
      path.join(this.dataDir, 'products.json'),
      JSON.stringify(this.products, null, 2)
    );
    return { success: true, product };
  }

  /**
   * 添加供应商
   */
  addSupplier(supplier) {
    this.suppliers.push({
      ...supplier,
      id: `sup_${Date.now()}`,
      createdAt: new Date().toISOString()
    });
    fs.ensureDirSync(this.dataDir);
    fs.writeFileSync(
      path.join(this.dataDir, 'suppliers.json'),
      JSON.stringify(this.suppliers, null, 2)
    );
    return { success: true, supplier };
  }

  /**
   * 获取选品历史
   */
  getHistory(limit = 10) {
    return this.history.slice(-limit).reverse();
  }
}

module.exports = { ProductSelector };
