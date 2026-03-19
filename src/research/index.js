/**
 * 市场调研模块
 * 
 * 整合竞品分析、市场趋势、需求调研
 */

const { CompetitorAnalysis } = require('./competitor_analysis');
const { MarketTrends } = require('./market_trends');
const { DemandResearch } = require('./demand_research');

module.exports = {
  // 竞品分析
  CompetitorAnalysis,
  
  // 市场趋势
  MarketTrends,
  
  // 需求调研
  DemandResearch,
  
  // 便捷函数
  async analyzeMarket(keywords, options = {}) {
    const demand = new DemandResearch(options);
    const trends = new MarketTrends(options);
    
    const [demandResult, trendsResult] = await Promise.all([
      demand.analyzeDemand(keywords, options),
      trends.getTrendsReport()
    ]);
    
    return {
      keywords,
      demand: demandResult,
      trends: trendsResult,
      opportunityScore: this.calculateOpportunityScore(demandResult, trendsResult)
    };
  },
  
  calculateOpportunityScore(demand, trends) {
    const vol = demand.score || 50;
    const growth = parseFloat(trends.growthAnalysis?.cagr || '10%');
    return Math.min(100, Math.round(vol * 0.5 + growth / 2));
  }
};
