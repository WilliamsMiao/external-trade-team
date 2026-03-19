/**
 * 数据收集技能索引
 * 
 * 供Agent调用的数据收集接口
 */

const skill1688 = require('./1688_search');
const skillTrends = require('./google_trends');
const skillWhatsApp = require('./whatsapp_business');

/**
 * Skill路由器
 */
async function routeSkill(skillName, params) {
  console.log(`[Skills] Routing: ${skillName}`);
  
  switch (skillName.toLowerCase()) {
    // 1688
    case '1688':
    case '1688_search':
    case 'alibaba':
      return await skill1688.skill1688_search(params);
    
    // Google Trends
    case 'trends':
    case 'google_trends':
    case '趋势':
      return await skillTrends.skillGoogleTrends(params);
    
    // WhatsApp
    case 'whatsapp':
    case 'whatsapp_business':
    case 'whatsapp消息':
      return await skillWhatsApp.skillWhatsApp(params);
    
    default:
      return { error: `Unknown skill: ${skillName}` };
  }
}

/**
 * 获取可用技能列表
 */
function listSkills() {
  return {
    data_collection: [
      { name: '1688_search', description: '搜索1688/阿里巴巴产品', category: '选品' },
      { name: 'google_trends', description: 'Google搜索趋势', category: '选品' },
      { name: 'whatsapp', description: 'WhatsApp Business消息', category: '获客' },
    ],
    data_processing: [
      { name: 'product_analyze', description: '产品分析', category: '选品' },
    ]
  };
}

module.exports = {
  routeSkill,
  listSkills,
  // 导出各技能
  skill1688,
  skillTrends,
  skillWhatsApp
};
