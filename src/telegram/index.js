/**
 * Telegram 消息发送工具
 * 
 * 供 Agent 发送消息到 Telegram 群组或用户
 */

const TelegramBot = require('node-telegram-bot-api');

// 缓存bot实例
const botCache = new Map();

/**
 * 获取或创建Bot实例
 */
function getBot(token) {
  if (!token) {
    // 尝试从环境变量获取
    token = process.env.TELEGRAM_BOT_TOKEN_HR 
        || process.env.TELEGRAM_BOT_TOKEN_COORDINATOR
        || process.env.TELEGRAM_BOT_TOKEN_SALES_LEAD
        || process.env.TELEGRAM_BOT_TOKEN_SUPPLY_LEAD
        || process.env.TELEGRAM_BOT_TOKEN_OPS_LEAD
        || process.env.TELEGRAM_BOT_TOKEN_FINANCE_LEAD;
  }
  
  if (!token) {
    throw new Error('No Telegram bot token available');
  }
  
  if (!botCache.has(token)) {
    const bot = new TelegramBot(token, { polling: false });
    botCache.set(token, bot);
  }
  
  return botCache.get(token);
}

/**
 * 发送消息到群组
 * 
 * @param {string|number} chatId - 群组ID
 * @param {string} message - 消息内容
 * @param {Object} options - 可选参数
 * @param {string} options.parse_mode - 解析模式 (Markdown/HTML)
 * @param {Object} options.reply_markup - 键盘等
 * @param {string} options.botToken - 指定bot token（可选）
 * @returns {Promise<Object>}
 */
async function sendToGroup(chatId, message, options = {}) {
  const bot = getBot(options.botToken);
  
  try {
    const result = await bot.sendMessage(chatId, message, {
      parse_mode: options.parse_mode || 'Markdown',
      reply_markup: options.reply_markup,
      disable_web_page_preview: options.disable_web_page_preview || true
    });
    
    return {
      success: true,
      message_id: result.message_id,
      chat_id: result.chat.id,
      date: result.date
    };
  } catch (error) {
    console.error('[Telegram] sendToGroup error:', error.message);
    throw new Error(`Failed to send message: ${error.message}`);
  }
}

/**
 * 发送消息给用户
 * 
 * @param {string|number} userId - 用户ID
 * @param {string} message - 消息内容
 * @param {Object} options - 可选参数
 * @returns {Promise<Object>}
 */
async function sendToUser(userId, message, options = {}) {
  const bot = getBot(options.botToken);
  
  try {
    const result = await bot.sendMessage(userId, message, {
      parse_mode: options.parse_mode || 'Markdown',
      reply_markup: options.reply_markup
    });
    
    return {
      success: true,
      message_id: result.message_id,
      user_id: result.from.id
    };
  } catch (error) {
    console.error('[Telegram] sendToUser error:', error.message);
    throw new Error(`Failed to send message: ${error.message}`);
  }
}

/**
 * 发送带按钮的消息
 * 
 * @param {string|number} chatId - 群组/用户ID
 * @param {string} message - 消息内容
 * @param {Array} buttons - 按钮数组 [{text, callback_data}]
 * @param {Object} options - 可选参数
 * @returns {Promise<Object>}
 */
async function sendWithButtons(chatId, message, buttons, options = {}) {
  const bot = getBot(options.botToken);
  
  const reply_markup = {
    inline_keyboard: buttons.map(btn => [{
      text: btn.text,
      callback_data: btn.callback_data
    }])
  };
  
  try {
    const result = await bot.sendMessage(chatId, message, {
      parse_mode: options.parse_mode || 'Markdown',
      reply_markup
    });
    
    return {
      success: true,
      message_id: result.message_id
    };
  } catch (error) {
    console.error('[Telegram] sendWithButtons error:', error.message);
    throw new Error(`Failed to send message: ${error.message}`);
  }
}

/**
 * 解析命令并提取参数
 * 
 * @param {string} text - 消息文本
 * @returns {Object} {command, args}
 */
function parseCommand(text) {
  if (!text || !text.startsWith('/')) {
    return { command: null, args: [] };
  }
  
  const parts = text.slice(1).split(' ');
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);
  
  return { command, args };
}

/**
 * 获取群组信息
 * 
 * @param {string|number} chatId - 群组ID
 * @returns {Promise<Object>}
 */
async function getChat(chatId) {
  const bot = getBot();
  
  try {
    return await bot.getChat(chatId);
  } catch (error) {
    console.error('[Telegram] getChat error:', error.message);
    throw error;
  }
}

/**
 * 获取聊天成员信息
 * 
 * @param {string|number} chatId - 群组ID
 * @param {string|number} userId - 用户ID
 * @returns {Promise<Object>}
 */
async function getChatMember(chatId, userId) {
  const bot = getBot();
  
  try {
    return await bot.getChatMember(chatId, userId);
  } catch (error) {
    console.error('[Telegram] getChatMember error:', error.message);
    throw error;
  }
}

module.exports = {
  sendToGroup,
  sendToUser,
  sendWithButtons,
  parseCommand,
  getChat,
  getChatMember,
  getBot
};

// 预设的群组ID映射（从环境变量）
module.exports.GROUP_IDS = {
  mgmt_hq: process.env.TELEGRAM_CHAT_ID_MGMT_HQ,
  sales_team: process.env.TELEGRAM_CHAT_ID_SALES_TEAM,
  supply_team: process.env.TELEGRAM_CHAT_ID_SUPPLY_TEAM,
  ops_team: process.env.TELEGRAM_CHAT_ID_OPS_TEAM,
  finance_team: process.env.TELEGRAM_CHAT_ID_FINANCE_TEAM
};
