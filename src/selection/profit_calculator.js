/**
 * 选品决策模块 - 利润计算
 * 
 * 计算产品利润和ROI
 */

/**
 * 利润计算器
 */
class ProfitCalculator {
  constructor(config = {}) {
    this.defaults = {
      platformFee: config.platformFee || 0.15,      // 15%
      paymentFee: config.paymentFee || 0.029,     // 2.9%
      shippingCost: config.shippingCost || 5,      // $5
      packagingCost: config.packagingCost || 1,   // $1
      storageFee: config.storageFee || 0.5,       // $0.5/件/月
      returnRate: config.returnRate || 0.05,      // 5%
      taxRate: config.taxRate || 0.0,            // 0% (视地区)
      adsSpend: config.adsSpend || 0.1            // 10%广告
    };
  }

  /**
   * 计算利润
   */
  calculateProfit(product, salePrice, volume = 100) {
    const costs = this.calculateCosts(product, salePrice, volume);
    const revenue = salePrice * volume;
    const totalCost = costs.total * volume;
    const profit = revenue - totalCost;
    const margin = (profit / revenue) * 100;
    const roi = ((revenue - totalCost) / totalCost) * 100;
    
    return {
      product: product.name,
      salePrice,
      volume,
      revenue: revenue.toFixed(2),
      costs: {
        unit: costs,
        total: totalCost.toFixed(2)
      },
      profit: {
        total: profit.toFixed(2),
        perUnit: (profit / volume).toFixed(2),
        margin: margin.toFixed(1),
        roi: roi.toFixed(1)
      },
      breakEven: this.calculateBreakEven(product, salePrice),
      calculatedAt: new Date().toISOString()
    };
  }

  /**
   * 计算单位成本
   */
  calculateCosts(product, salePrice, volume) {
    const unitCost = product.costPrice || product.basePrice * 0.4;
    const shipping = this.defaults.shippingCost;
    const packaging = this.defaults.packagingCost;
    const platformFee = salePrice * this.defaults.platformFee;
    const paymentFee = salePrice * this.defaults.paymentFee;
    const ads = salePrice * this.defaults.adsSpend;
    const storage = this.defaults.storageFee;
    const returnCost = salePrice * this.defaults.returnRate;
    const tax = salePrice * this.defaults.taxRate;
    
    return {
      product: unitCost,
      shipping,
      packaging,
      platformFee,
      paymentFee,
      ads,
      storage,
      returnReserve: returnCost,
      tax,
      total: unitCost + shipping + packaging + platformFee + paymentFee + ads + storage + returnCost + tax
    };
  }

  /**
   * 计算盈亏平衡点
   */
  calculateBreakEven(product, salePrice) {
    const fixedCosts = 1000; // 固定成本（样品、测试等）
    const unitProfit = salePrice - this.calculateCosts(product, salePrice, 1).total;
    
    if (unitProfit <= 0) return null;
    
    return Math.ceil(fixedCosts / unitProfit);
  }

  /**
   * 多SKU利润对比
   */
  compareProducts(products, marketPrice) {
    return products.map(product => {
      const profit = this.calculateProfit(product, marketPrice);
      return {
        product: product.name,
        cost: product.costPrice || product.basePrice * 0.4,
        price: marketPrice,
        profit: profit.profit,
        margin: profit.profit.margin,
        roi: profit.profit.roi,
        score: this.calculateScore(profit)
      };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * 计算综合评分
   */
  calculateScore(profitData) {
    const margin = parseFloat(profitData.profit.margin);
    const roi = parseFloat(profitData.profit.roi);
    const breakEven = profitData.breakEven || 1000;
    
    // 综合评分 = 利润率(40%) + ROI(40%) + 回本速度(20%)
    const marginScore = Math.min(100, margin * 5);
    const roiScore = Math.min(100, roi / 2);
    const breakEvenScore = Math.max(0, 100 - breakEven / 10);
    
    return Math.round(marginScore * 0.4 + roiScore * 0.4 + breakEvenScore * 0.2);
  }

  /**
   * 价格灵敏度分析
   */
  priceSensitivityAnalysis(product, priceRange) {
    const prices = [];
    const step = (priceRange.max - priceRange.min) / 10;
    
    for (let price = priceRange.min; price <= priceRange.max; price += step) {
      const profit = this.calculateProfit(product, price);
      prices.push({
        price: price.toFixed(2),
        profit: parseFloat(profit.profit.perUnit),
        margin: parseFloat(profit.profit.margin),
        roi: parseFloat(profit.profit.roi),
        recommended: parseFloat(profit.profit.margin) >= 30
      });
    }
    
    // 找最优价格
    const optimal = prices.reduce((best, curr) => 
      curr.profit > best.profit ? curr : best, prices[0]);
    
    return {
      analysis: prices,
      optimalPrice: optimal.price,
      maxProfit: optimal.profit,
      recommendation: optimal.price
    };
  }

  /**
   * 批量计算
   */
  batchCalculate(productList, salePrice, volume) {
    return productList.map(product => ({
      product: product.name,
      ...this.calculateProfit(product, salePrice, volume)
    }));
  }
}

module.exports = { ProfitCalculator };
