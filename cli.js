#!/usr/bin/env node
/**
 * 外部贸易团队CLI工具
 * 
 * 交互式命令行工具
 */

const readline = require('readline');

// 简单彩色输出
const c = {
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`
};
const chalk = {
  cyan: c.cyan, green: c.green, yellow: c.yellow, red: c.red, bold: c.bold, gray: c.gray
};

// 模块
const research = require('./src/research');
const selection = require('./src/selection');
const sales = require('./src/sales/parse_inquiry');
const supply = require('./src/supply/check_inventory');
const finance = require('./src/finance/generate_invoice');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log(chalk.cyan(`
╔══════════════════════════════════════════════════════════════╗
║     🌍 外部贸易团队 - 智能外贸自动化系统 v2.0              ║
╠══════════════════════════════════════════════════════════════╣
║  1. 🔍 市场调研                                          ║
║  2. 🎯 智能选品                                          ║
║  3. 📧 询盘处理                                          ║
║  4. 📦 库存检查                                          ║
║  5. 💰 利润计算                                          ║
║  6. 🚚 物流报价                                          ║
║  7. 🔄 完整流程测试                                       ║
║  0. 🚪 退出                                              ║
╚══════════════════════════════════════════════════════════════╝
`));

const menu = () => {
  rl.question(chalk.yellow('\n👉 请选择功能 (0-7): '), async (choice) => {
    switch (choice) {
      case '1':
        await marketResearch();
        break;
      case '2':
        await productSelection();
        break;
      case '3':
        await inquiryProcess();
        break;
      case '4':
        await inventoryCheck();
        break;
      case '5':
        await profitCalc();
        break;
      case '6':
        await logisticsQuote();
        break;
      case '7':
        await fullFlowTest();
        break;
      case '0':
        console.log(chalk.green('\n👋 再见！'));
        process.exit(0);
      default:
        console.log(chalk.red('\n❌ 无效选择，请重试'));
    }
    menu();
  });
};

// 1. 市场调研
const marketResearch = async () => {
  console.log(chalk.cyan('\n🔍 【市场调研】\n'));
  
  rl.question(chalk.yellow('输入调研关键词 (逗号分隔): '), async (keywords) => {
    const kw = keywords.split(',').map(k => k.trim()).filter(k => k);
    if (kw.length === 0) {
      console.log(chalk.red('❌ 请输入关键词'));
      return;
    }

    console.log(chalk.gray('\n⏳ 分析中...\n'));
    
    try {
      const { DemandResearch } = require('./src/research');
      const demand = new DemandResearch();
      const result = await demand.analyzeDemand(kw);
      
      console.log(chalk.green('✅ 调研完成!\n'));
      console.log(chalk.cyan('📊 需求得分:'), chalk.bold(result.score));
      console.log(chalk.cyan('📈 搜索量:'), result.searchVolume.map(v => `${v.keyword}: ${v.monthlyVolume}`).join(', '));
      console.log(chalk.cyan('🏢 竞争度:'), result.competition.saturation);
      
      if (result.recommendations.length > 0) {
        console.log(chalk.yellow('\n💡 建议:'));
        result.recommendations.forEach(r => console.log(`   • ${r.message}`));
      }
    } catch (e) {
      console.log(chalk.red('❌ 错误:'), e.message);
    }
  });
};

// 2. 智能选品
const productSelection = async () => {
  console.log(chalk.cyan('\n🎯 【智能选品】\n'));
  
  rl.question(chalk.yellow('输入选品关键词: '), async (keyword) => {
    if (!keyword.trim()) {
      console.log(chalk.red('❌ 请输入关键词'));
      return;
    }

    console.log(chalk.gray('\n⏳ 匹配产品中...\n'));
    
    try {
      const { ProductMatcher } = require('./src/selection');
      const matcher = new ProductMatcher();
      const result = await matcher.matchProducts({ keywords: [keyword.trim()] });
      
      console.log(chalk.green('✅ 匹配完成!\n'));
      console.log(chalk.cyan('🏆 Top 3 产品:'));
      
      result.topMatches.slice(0, 3).forEach((m, i) => {
        console.log(`   ${i+1}. ${m.product.name} (得分: ${m.totalScore})`);
        console.log(`      价格: $${m.product.basePrice?.toFixed(2)} | MOQ: ${m.product.moq}`);
      });
      
      console.log(chalk.yellow('\n💡 建议:'));
      result.recommendations.forEach(r => console.log(`   • ${r.message}`));
    } catch (e) {
      console.log(chalk.red('❌ 错误:'), e.message);
    }
  });
};

// 3. 询盘处理
const inquiryProcess = async () => {
  console.log(chalk.cyan('\n📧 【询盘处理】\n'));
  
  rl.question(chalk.yellow('输入询盘内容: '), async (text) => {
    if (!text.trim()) {
      console.log(chalk.red('❌ 请输入询盘内容'));
      return;
    }

    console.log(chalk.gray('\n⏳ 解析中...\n'));
    
    try {
      const { parseInquiry } = require('./src/sales/parse_inquiry');
      const inquiry = await parseInquiry(text, 'cli');
      
      console.log(chalk.green('✅ 解析完成!\n'));
      console.log(chalk.cyan('📝 询盘ID:'), inquiry.id);
      console.log(chalk.cyan('📦 产品:'), inquiry.products.join(', '));
      console.log(chalk.cyan('🔢 数量:'), inquiry.quantity || '待确认');
      console.log(chalk.cyan('💵 预算:'), inquiry.budget ? `$${inquiry.budget.amount}` : '待确认');
      console.log(chalk.cyan('🌐 语言:'), inquiry.language);
      
      // 自动报价
      const { generateQuote } = require('./src/sales/generate_quote');
      const quote = await generateQuote(inquiry);
      
      console.log(chalk.green('\n💰 自动报价:'));
      console.log(`   总价: $${quote.pricing.total} ${quote.pricing.currency}`);
      console.log(`   利润率: ${(quote.pricing.margin * 100).toFixed(0)}%`);
    } catch (e) {
      console.log(chalk.red('❌ 错误:'), e.message);
    }
  });
};

// 4. 库存检查
const inventoryCheck = async () => {
  console.log(chalk.cyan('\n📦 【库存检查】\n'));
  
  rl.question(chalk.yellow('输入产品名称: '), async (product) => {
    rl.question(chalk.yellow('输入需求数量: '), async (qty) => {
      const q = parseInt(qty) || 100;
      
      console.log(chalk.gray('\n⏳ 检查中...\n'));
      
      try {
        const { checkInventory } = require('./src/supply/check_inventory');
        const result = await checkInventory(product || 'widget', q);
        
        console.log(chalk.green('✅ 检查完成!\n'));
        console.log(chalk.cyan('📦 产品:'), result.product);
        console.log(chalk.cyan('📊 状态:'), result.status);
        console.log(chalk.cyan('🔢 库存:'), result.quantity);
        console.log(chalk.cyan('✅ 可满足:'), result.can_fulfill ? '是' : '否');
        
        if (!result.can_fulfill) {
          console.log(chalk.yellow('\n💡 建议: 需要采购 ' + result.shortage + ' 件'));
        }
      } catch (e) {
        console.log(chalk.red('❌ 错误:'), e.message);
      }
    });
  });
};

// 5. 利润计算
const profitCalc = async () => {
  console.log(chalk.cyan('\n💰 【利润计算】\n'));
  
  rl.question(chalk.yellow('输入产品成本 ($): '), async (cost) => {
    rl.question(chalk.yellow('输入销售价格 ($): '), async (price) => {
      rl.question(chalk.yellow('输入销售数量: '), async (volume) => {
        const c = parseFloat(cost) || 10;
        const p = parseFloat(price) || 25;
        const v = parseInt(volume) || 100;
        
        console.log(chalk.gray('\n⏳ 计算中...\n'));
        
        try {
          const { ProfitCalculator } = require('./src/selection/profit_calculator');
          const calc = new ProfitCalculator();
          
          const product = { name: 'Sample Product', costPrice: c };
          const result = calc.calculateProfit(product, p, v);
          
          console.log(chalk.green('✅ 计算完成!\n'));
          console.log(chalk.cyan('💵 销售收入:'), `$${result.revenue}`);
          console.log(chalk.cyan('📊 总成本:'), `$${result.costs.total}`);
          console.log(chalk.green('💰 利润:'), `$${result.profit.total}`);
          console.log(chalk.green('📈 利润率:'), `${result.profit.margin}%`);
          console.log(chalk.green('🎯 ROI:'), `${result.profit.roi}%`);
        } catch (e) {
          console.log(chalk.red('❌ 错误:'), e.message);
        }
      });
    });
  });
};

// 6. 物流报价
const logisticsQuote = async () => {
  console.log(chalk.cyan('\n🚚 【物流报价】\n'));
  
  rl.question(chalk.yellow('输入产品重量 (kg): '), async (weight) => {
    rl.question(chalk.yellow('输入目的国 (CN/US/DE...): '), async (country) => {
      const w = parseFloat(weight) || 5;
      const c = country || 'US';
      
      console.log(chalk.gray('\n⏳ 询价中...\n'));
      
      // Mock物流报价
      const carriers = [
        { name: 'FedEx', days: 3, price: w * 10 + 20 },
        { name: 'DHL', days: 4, price: w * 9 + 18 },
        { name: 'UPS', days: 3, price: w * 11 + 22 }
      ];
      
      console.log(chalk.green('✅ 报价完成!\n'));
      console.log(chalk.cyan('📦 重量:'), `${w}kg → ${c}\n`);
      
      carriers.forEach((carr, i) => {
        const best = i === 0 ? ' ⭐推荐' : '';
        console.log(chalk.yellow(`   ${i+1}. ${carr.name}${best}`));
        console.log(`      时效: ${carr.days}天 | 价格: $${carr.price.toFixed(2)}`);
      });
    });
  });
};

// 7. 完整流程测试
const fullFlowTest = async () => {
  console.log(chalk.cyan('\n🔄 【完整流程测试】\n'));
  console.log(chalk.gray('='.repeat(50)));
  
  const testInquiry = '客户ABC公司询500件电子产品，预算$15,000';
  
  try {
    // Step 1: 询盘解析
    console.log(chalk.cyan('\n📧 Step 1: 询盘解析'));
    const { parseInquiry } = require('./src/sales/parse_inquiry');
    const inquiry = await parseInquiry(testInquiry, 'test');
    console.log(chalk.green('   ✅ 解析完成'), `| ID: ${inquiry.id}`);
    console.log(chalk.gray(`   产品: ${inquiry.products} | 数量: ${inquiry.quantity} | 预算: $${inquiry.budget?.amount}`));
    
    // Step 2: 报价生成
    console.log(chalk.cyan('\n💰 Step 2: 报价生成'));
    const { generateQuote } = require('./src/sales/generate_quote');
    const quote = await generateQuote(inquiry);
    console.log(chalk.green('   ✅ 报价完成'), `| 总价: $${quote.pricing.total}`);
    
    // Step 3: 库存检查
    console.log(chalk.cyan('\n📦 Step 3: 库存检查'));
    const { checkInventory } = require('./src/supply/check_inventory');
    const inv = await checkInventory(inquiry.products[0] || 'widget', inquiry.quantity);
    console.log(chalk.green('   ✅ 库存检查'), `| ${inv.status} | 可满足: ${inv.can_fulfill ? '是' : '否'}`);
    
    // Step 4: 供应商匹配
    console.log(chalk.cyan('\n🏭 Step 4: 供应商匹配'));
    const { SupplierMatcher } = require('./src/selection/supplier_matcher');
    const sm = new SupplierMatcher();
    const suppliers = await sm.matchSuppliers({ product: inquiry.products[0] || 'electronics' });
    console.log(chalk.green('   ✅ 匹配完成'), `| Top: ${suppliers.topMatches[0]?.supplier.name}`);
    
    // Step 5: 利润计算
    console.log(chalk.cyan('\n📊 Step 5: 利润分析'));
    const { ProfitCalculator } = require('./src/selection/profit_calculator');
    const pc = new ProfitCalculator();
    const profit = pc.calculateProfit(
      { name: inquiry.products[0], costPrice: quote.pricing.total * 0.4 },
      quote.pricing.total * 1.5,
      inquiry.quantity
    );
    console.log(chalk.green('   ✅ 利润分析'), `| 利润率: ${profit.profit.margin}% | ROI: ${profit.profit.roi}%`);
    
    // Step 6: 需求调研
    console.log(chalk.cyan('\n🔍 Step 6: 市场需求验证'));
    const { DemandResearch } = require('./src/research');
    const dr = new DemandResearch();
    const demand = await dr.analyzeDemand(inquiry.products);
    console.log(chalk.green('   ✅ 需求验证'), `| 需求得分: ${demand.score}`);
    
    console.log(chalk.gray('\n' + '='.repeat(50)));
    console.log(chalk.green('\n🎉 完整流程测试通过!'));
    console.log(chalk.cyan('\n📋 汇总:'));
    console.log(`   询盘: ${inquiry.id} → 报价: $${quote.pricing.total}`);
    console.log(`   库存: ${inv.status} → 供应商: ${suppliers.topMatches[0]?.supplier.name}`);
    console.log(`   利润: ${profit.profit.margin}% → 需求验证: ${demand.score}分`);
    
  } catch (e) {
    console.log(chalk.red('\n❌ 测试失败:'), e.message);
    console.log(e.stack);
  }
};

// 启动
console.log(chalk.gray('\n启动中...\n'));
setTimeout(menu, 500);
