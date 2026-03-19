/**
 * 选品决策模块
 * 
 * 整合产品匹配、利润计算、供应商匹配
 */

const { ProductMatcher } = require('./product_matcher');
const { ProfitCalculator } = require('./profit_calculator');
const { SupplierMatcher } = require('./supplier_matcher');

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
