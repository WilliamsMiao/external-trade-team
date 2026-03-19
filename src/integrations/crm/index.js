/**
 * CRM 集成模块 - Salesforce / HubSpot
 * 
 * 与CRM系统同步客户和订单数据
 */

const fs = require('fs-extra');
const path = require('path');

// CRM类型
const CRM_TYPE = {
  SALESFORCE: 'salesforce',
  HUBSPOT: 'hubspot'
};

/**
 * Salesforce 集成
 */
class SalesforceCRM {
  constructor(config) {
    this.instanceUrl = config.instanceUrl;
    this.accessToken = config.accessToken;
    this.apiVersion = 'v58.0';
  }

  async query(soql) {
    // Mock实现
    console.log(`[Salesforce] Query: ${soql}`);
    return { records: [], totalSize: 0 };
  }

  async createRecord(object, data) {
    console.log(`[Salesforce] Create ${object}:`, data);
    return { id: 'mock-id', success: true };
  }

  async updateRecord(object, id, data) {
    console.log(`[Salesforce] Update ${object}/${id}:`, data);
    return { id, success: true };
  }

  async getAccount(email) {
    const result = await this.query(`SELECT Id, Name, Email FROM Account WHERE Email = '${email}'`);
    return result.records[0] || null;
  }

  async createContact(accountId, contactData) {
    return this.createRecord('Contact', {
      AccountId: accountId,
      ...contactData
    });
  }

  async createOpportunity(accountId, oppData) {
    return this.createRecord('Opportunity', {
      AccountId: accountId,
      StageName: 'Prospecting',
      CloseDate: new Date().toISOString().split('T')[0],
      ...oppData
    });
  }
}

/**
 * HubSpot 集成
 */
class HubSpotCRM {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.baseUrl = 'https://api.hubapi.com';
  }

  async request(endpoint, method = 'GET', body = null) {
    // Mock实现
    console.log(`[HubSpot] ${method} ${endpoint}`);
    return {};
  }

  async createContact(contactData) {
    return this.request('/crm/v3/objects/contacts', 'POST', {
      properties: contactData
    });
  }

  async createDeal(dealData) {
    return this.request('/crm/v3/objects/deals', 'POST', {
      properties: dealData
    });
  }

  async searchContacts(email) {
    return this.request('/crm/v3/objects/contacts/search', 'POST', {
      filterGroups: [{
        filters: [{
          propertyName: 'email',
          operator: 'EQ',
          value: email
        }]
      }]
    });
  }
}

/**
 * CRM工厂函数
 */
function createCRM(type, config) {
  switch (type) {
    case CRM_TYPE.SALESFORCE:
      return new SalesforceCRM(config);
    case CRM_TYPE.HUBSPOT:
      return new HubSpotCRM(config);
    default:
      throw new Error(`Unknown CRM type: ${type}`);
  }
}

/**
 * 同步客户到CRM
 */
async function syncCustomerToCRM(customer, crmConfig) {
  const crm = createCRM(crmConfig.type, crmConfig);
  
  // 根据CRM类型创建客户
  if (crmConfig.type === CRM_TYPE.SALESFORCE) {
    const account = await crm.createRecord('Account', {
      Name: customer.company || customer.name,
      BillingEmail: customer.email,
      Phone: customer.phone
    });
    return account;
  } else if (crmConfig.type === CRM_TYPE.HUBSPOT) {
    const contact = await crm.createContact({
      email: customer.email,
      firstname: customer.name.split(' ')[0],
      lastname: customer.name.split(' ').slice(1).join(' '),
      company: customer.company,
      phone: customer.phone
    });
    return contact;
  }
}

/**
 * 同步订单到CRM
 */
async function syncOrderToCRM(order, customer, crmConfig) {
  const crm = createCRM(crmConfig.type, crmConfig);
  
  if (crmConfig.type === CRM_TYPE.SALESFORCE) {
    return crm.createOpportunity(null, {
      Name: `Order ${order.order_id}`,
      Amount: order.total_amount,
      Description: order.notes
    });
  } else if (crmConfig.type === CRM_TYPE.HUBSPOT) {
    return crm.createDeal({
      dealname: `Order ${order.order_id}`,
      amount: order.total_amount,
      pipeline: 'default',
      dealstage: 'appointmentscheduled'
    });
  }
}

module.exports = {
  CRM_TYPE,
  SalesforceCRM,
  HubSpotCRM,
  createCRM,
  syncCustomerToCRM,
  syncOrderToCRM
};
