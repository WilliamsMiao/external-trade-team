#!/usr/bin/env node
/**
 * 外部贸易团队 - 初始化配置工具
 * 
 * 交互式配置向导
 */

const fs = require('fs');
const path = require('path');

const rl = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

// 颜色
const c = {
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`
};

console.log(`
${c.cyan('╔═══════════════════════════════════════════════════════════════╗')}
${c.cyan('║')}     🌍 外部贸易团队 - 初始化配置向导                 ${c.cyan('║')}
${c.cyan('╚═══════════════════════════════════════════════════════════════╝')}
`);

// 问题列表
const questions = [
  {
    category: '📦 选品数据源',
    items: [
      { key: 'ALIBABA_APP_KEY', label: '1688 App Key', desc: '阿里开放平台AppKey' },
      { key: 'ALIBABA_APP_SECRET', label: '1688 App Secret', desc: '阿里开放平台AppSecret', secret: true },
      { key: 'AMAZON_ACCESS_KEY', label: 'Amazon Access Key', desc: '亚马逊API访问密钥' },
      { key: 'AMAZON_SECRET_KEY', label: 'Amazon Secret Key', desc: '亚马逊API密钥', secret: true },
      { key: 'SERPAPI_KEY', label: 'SerpAPI Key', desc: 'Google Trends数据' },
    ]
  },
  {
    category: '📢 获客数据源',
    items: [
      { key: 'WHATSAPP_BUSINESS_ID', label: 'WhatsApp Business ID', desc: 'WhatsApp商业账号ID' },
      { key: 'WHATSAPP_ACCESS_TOKEN', label: 'WhatsApp Token', desc: '访问令牌', secret: true },
      { key: 'ALIBABA_TRADE_APP_KEY', label: '阿里国际站 App Key', desc: '阿里巴巴国际站AppKey' },
      { key: 'ALIBABA_TRADE_APP_SECRET', label: '阿里国际站 Secret', desc: 'AppSecret', secret: true },
    ]
  },
  {
    category: '🔗 CRM集成',
    items: [
      { key: 'HUBSPOT_API_KEY', label: 'HubSpot API Key', desc: 'HubSpot API密钥' },
      { key: 'SALESFORCE_CLIENT_ID', label: 'Salesforce Client ID', desc: 'Connected App Client ID' },
      { key: 'SALESFORCE_CLIENT_SECRET', label: 'Salesforce Client Secret', desc: 'Connected App密钥', secret: true },
    ]
  },
  {
    category: '💬 Telegram通知',
    items: [
      { key: 'TELEGRAM_BOT_TOKEN', label: 'Bot Token', desc: '@BotFather获取' },
      { key: 'TELEGRAM_CHAT_ID_MGMT_HQ', label: '管理群Chat ID', desc: '群ID (给机器人发消息获取)' },
    ]
  }
];

// 默认值
const defaults = {
  DATABASE_URL: 'postgresql://openclaw:password@localhost:5432/openclaw_trade',
  NODE_ENV: 'production',
  TIMEZONE: 'Asia/Hong_Kong',
  LOG_LEVEL: 'info'
};

const answers = { ...defaults };

// 跳过的问题（可选）
const skipQuestions = ['AMAZON_ACCESS_KEY', 'AMAZON_SECRET_KEY', 'SERPAPI_KEY', 'WHATSAPP_ACCESS_TOKEN'];

async function askQuestion(q) {
  return new Promise((resolve) => {
    const isSkip = skipQuestions.includes(q.key);
    const prompt = isSkip 
      ? `${c.gray('○ ')} ${c.yellow(q.label)} ${c.gray(`(${q.desc})`)} [可选, 回车跳过]: `
      : `${c.gray('● ')} ${c.yellow(q.label)} ${c.gray(`(${q.desc})`)}: `;
    
    rl.question(prompt, (answer) => {
      if (answer.trim() === '' && !isSkip) {
        console.log(`  ${c.red('✗ 必填')}`);
        askQuestion(q).then(resolve);
      } else {
        if (answer.trim()) {
          answers[q.key] = answer.trim();
          console.log(`  ${c.green('✓')}`);
        } else {
          console.log(`  ${c.gray('↩ 跳过')}`);
        }
        resolve();
      }
    });
  });
}

async function askCategory(category) {
  console.log(`\n${c.bold(category.category)}`);
  console.log(c.gray('─'.repeat(50)));
  
  for (const item of category.items) {
    await askQuestion(item);
  }
}

async function main() {
  // 欢迎
  console.log(c.gray('此向导将帮助你配置系统所需的各种API。'));
  console.log(c.gray('必填项必须填写，可选项可以直接回车跳过。\n'));
  
  // 逐类提问
  for (const category of questions) {
    await askCategory(category);
  }
  
  // 选择性模块
  console.log(`\n${c.bold('📦 选择性模块配置')}`);
  console.log(c.gray('─'.repeat(50)));
  
  const more = await new Promise((resolve) => {
    rl.question(`${c.gray('○ ')} 是否配置其他模块? (y/n): `, (answer) => {
      resolve(answer.toLowerCase() === 'y');
    });
  });
  
  if (more) {
    console.log(`\n${c.yellow('请手动编辑 .env 文件添加更多配置')}`);
    console.log(`参考: ${c.cyan('.env.example')}\n`);
  }
  
  // 生成.env
  console.log(`\n${c.bold('💾 生成配置文件...')}`);
  
  let envContent = `# 外部贸易团队 - 环境配置
# 由初始化向导生成

`;
  
  for (const [key, value] of Object.entries(answers)) {
    if (value) {
      envContent += `${key}=${value}\n`;
    }
  }
  
  // 写入文件
  fs.writeFileSync('.env', envContent);
  console.log(`  ${c.green('✓')} 已生成 .env`);
  
  // 生成数据目录
  fs.mkdirSync('data', { recursive: true });
  fs.mkdirSync('logs', { recursive: true });
  console.log(`  ${c.green('✓')} 已创建 data/ 和 logs/ 目录`);
  
  // 完成
  console.log(`
${c.green('╔═══════════════════════════════════════════════════════════════╗')}
${c.green('║')}     ✅ 初始化完成!                                    ${c.green('║')}
${c.green('╚═══════════════════════════════════════════════════════════════╝')}

${c.yellow('下一步:')}
  1. 编辑 .env 添加更多配置
  2. 运行 ${c.cyan('make start')} 启动服务
  3. 运行 ${c.cyan('make test')} 测试系统

${c.gray('如需配置更多API，请参考 .env.example')}
`);
  
  rl.close();
}

main().catch(console.error);
