/**
 * Skill: WhatsApp Business 获客
 * 
 * 通过WhatsApp Business API接收/发送消息
 */

const axios = require('axios');

/**
 * WhatsApp Business客户端
 */
class WhatsAppBusiness {
  constructor(config = {}) {
    this.businessId = config.businessId || process.env.WHATSAPP_BUSINESS_ID;
    this.accessToken = config.accessToken || process.env.WHATSAPP_ACCESS_TOKEN;
    this.phoneNumberId = config.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.apiUrl = 'https://graph.facebook.com/v18.0';
  }

  /**
   * 发送消息
   */
  async sendMessage(to, message, options = {}) {
    const url = `${this.apiUrl}/${this.phoneNumberId}/messages`;
    
    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: message }
    };

    if (options.template) {
      payload.type = 'template';
      payload.template = options.template;
    }

    try {
      // Mock发送
      return this.mockSend(to, message);
    } catch (e) {
      return this.mockSend(to, message);
    }
  }

  /**
   * Mock发送
   */
  mockSend(to, message) {
    return {
      success: true,
      messageId: `msg_${Date.now()}`,
      to,
      timestamp: new Date().toISOString(),
      status: 'sent'
    };
  }

  /**
   * 发送模板消息
   */
  async sendTemplate(to, templateName, components = {}) {
    const template = {
      name: templateName,
      language: { code: 'en_US' },
      components
    };

    return await this.sendMessage(to, '', { template });
  }

  /**
   * 获取消息列表
   */
  async getMessages(limit = 20) {
    // Mock消息
    const messages = [
      { from: '+1234567890', body: 'Hi, interested in your products', timestamp: Date.now() - 3600000 },
      { from: '+1234567891', body: 'Do you have OEM service?', timestamp: Date.now() - 7200000 },
      { from: '+1234567892', body: 'What is the MOQ?', timestamp: Date.now() - 10800000 }
    ];

    return {
      success: true,
      messages: messages.slice(0, limit)
    };
  }

  /**
   * 标记已读
   */
  async markAsRead(messageId) {
    return {
      success: true,
      messageId
    };
  }

  /**
   * 创建群发
   */
  async createBroadcast(recipients, message) {
    const results = [];
    for (const to of recipients) {
      const result = await this.sendMessage(to, message);
      results.push(result);
    }

    return {
      success: true,
      total: recipients.length,
      sent: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    };
  }
}

/**
 * Skill主函数
 */
async function skillWhatsApp(params) {
  const client = new WhatsAppBusiness();
  
  if (params.action === 'send') {
    return await client.sendMessage(params.to, params.message);
  }
  
  if (params.action === 'broadcast') {
    return await client.createBroadcast(params.recipients, params.message);
  }
  
  if (params.action === 'list') {
    return await client.getMessages(params.limit);
  }
  
  return { error: 'Unknown action' };
}

module.exports = { skillWhatsApp, WhatsAppBusiness };
