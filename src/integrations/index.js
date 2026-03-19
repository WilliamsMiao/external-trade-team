/**
 * 外部系统集成模块
 * 
 * 统一出口，整合 CRM、支付、物流
 */

const crm = require('./crm');
const payment = require('./payment');
const logistics = require('./logistics');

module.exports = {
  // CRM
  crm: {
    ...crm,
    syncCustomer: crm.syncCustomerToCRM,
    syncOrder: crm.syncOrderToCRM
  },
  
  // 支付
  payment: {
    ...payment,
    processPayment,
    processRefund,
    processInternationalTransfer
  },
  
  // 物流
  logistics: {
    ...logistics,
    createShipment,
    trackShipment,
    cancelShipment,
    selectBestCarrier
  },
  
  // 便捷函数
  async initAll(configs) {
    console.log('[Integrations] Initializing...');
    return {
      crm: configs.crm ? crm.createCRM(configs.crm.type, configs.crm) : null,
      payment: configs.stripe ? payment.createPayment('stripe', configs.stripe) : null,
      logistics: configs.fedex ? logistics.createCarrier('fedex', configs.fedex) : null
    };
  }
};

// 重新导出便捷函数
async function processPayment(provider, config, order) {
  return payment.processPayment(provider, config, order);
}

async function createShipment(carrier, config, order) {
  return logistics.createShipment(carrier, config, order);
}

async function trackShipment(carrier, config, trackingNumber) {
  return logistics.trackShipment(carrier, config, trackingNumber);
}

async function selectBestCarrier(configs, fromCountry, toCountry, weight) {
  return logistics.selectBestCarrier(configs, fromCountry, toCountry, weight);
}

module.exports.processPayment = processPayment;
module.exports.createShipment = createShipment;
module.exports.trackShipment = trackShipment;
module.exports.selectBestCarrier = selectBestCarrier;
