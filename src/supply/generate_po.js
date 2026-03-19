/**
 * Supply Lead - 采购订单生成工具
 * 
 * 生成采购订单
 */

const { logAction } = require('../audit');

/**
 * 采购订单状态
 */
const PO_STATUS = {
  DRAFT: 'draft',
  SENT: 'sent',
  CONFIRMED: 'confirmed',
  SHIPPED: 'shipped',
  RECEIVED: 'received',
  CANCELLED: 'cancelled'
};

/**
 * 生成采购订单
 * 
 * @param {Object} params - 采购参数
 * @param {string} params.supplierId - 供应商ID
 * @param {Array} params.items - 采购项 [{product, quantity, unitPrice}]
 * @param {Object} params.options - 选项
 * @returns {Promise<Object>} 采购订单对象
 */
async function generatePO(params, options = {}) {
  const { supplierId, items } = params;
  const {
    paymentTerms = 'T/T 30%',
    incoterms = 'FOB',
    leadTimeDays = 21,
    shippingAddress = 'Default Warehouse'
  } = options;
  
  // 1. 获取供应商信息
  const supplier = await getSupplier(supplierId);
  
  // 2. 计算总价
  let subtotal = 0;
  const lineItems = items.map(item => {
    const amount = item.quantity * item.unitPrice;
    subtotal += amount;
    return {
      product: item.product,
      sku: item.sku || `SKU-${item.product}`,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      amount
    };
  });
  
  // 3. 计算运费和总价
  const freight = calculateFreight(supplier.country, subtotal);
  const tax = subtotal * (supplier.taxRate || 0.1);
  const total = subtotal + freight + tax;
  
  // 4. 生成PO号
  const poNumber = generatePONumber();
  
  // 5. 构建采购订单
  const po = {
    po_number: poNumber,
    status: PO_STATUS.DRAFT,
    
    // 供应商信息
    supplier: {
      id: supplier.id,
      name: supplier.name,
      contact: supplier.contact,
      email: supplier.email
    },
    
    // 采购项
    items: lineItems,
    
    // 价格明细
    pricing: {
      subtotal,
      freight,
      tax,
      total,
      currency: 'USD'
    },
    
    // 条款
    terms: {
      payment_terms: paymentTerms,
      incoterms,
      lead_time_days: leadTimeDays,
      shipping_address: shippingAddress
    },
    
    // 预期交期
    expected_delivery: calculateExpectedDelivery(leadTimeDays),
    
    // 元数据
    created_at: new Date().toISOString(),
    created_by: 'supply_lead',
    version: 1
  };
  
  // 6. 记录审计日志
  try {
    await logAction(
      4, // Supply Lead agent ID
      'po_created',
      'purchase_order',
      poNumber,
      {
        supplier: supplier.name,
        total,
        item_count: items.length
      }
    );
  } catch (e) {
    console.log('[Supply] Audit log skipped');
  }
  
  console.log(`[Supply] Generated PO ${poNumber} for supplier ${supplier.name}: Total $${total}`);
  
  return po;
}

/**
 * 获取供应商信息
 */
async function getSupplier(supplierId) {
  // 模拟供应商数据
  const suppliers = {
    'sup-001': {
      id: 'sup-001',
      name: 'ABC Suppliers Ltd',
      contact: 'John Smith',
      email: 'john@abcs Suppliers.com',
      country: 'China',
      taxRate: 0.13,
      rating: 4.5
    },
    'sup-002': {
      id: 'sup-002',
      name: 'XYZ Manufacturing',
      contact: 'Li Wei',
      email: 'liwei@xyzmanufacturing.com',
      country: 'China',
      taxRate: 0.13,
      rating: 4.2
    }
  };
  
  return suppliers[supplierId] || {
    id: supplierId,
    name: 'Unknown Supplier',
    contact: 'N/A',
    email: 'unknown@supplier.com',
    country: 'China',
    taxRate: 0.13,
    rating: 3.0
  };
}

/**
 * 计算运费
 */
function calculateFreight(country, subtotal) {
  // 简化计算
  if (subtotal > 5000) {
    return 0; // 大额订单免运费
  }
  return 100; // 基础运费
}

/**
 * 计算预期交期
 */
function calculateExpectedDelivery(leadTimeDays) {
  const date = new Date();
  date.setDate(date.getDate() + leadTimeDays);
  return date.toISOString().split('T')[0];
}

/**
 * 生成PO号
 */
function generatePONumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  return `PO-${timestamp}`;
}

/**
 * 发送PO给供应商（mock）
 */
async function sendPOToSupplier(po, supplierEmail) {
  console.log(`[Supply] Mock: Sending PO ${po.po_number} to ${supplierEmail}`);
  
  // 更新状态
  po.status = PO_STATUS.SENT;
  po.sent_at = new Date().toISOString();
  
  try {
    await logAction(
      4,
      'po_sent',
      'purchase_order',
      po.po_number,
      { supplier: po.supplier.email }
    );
  } catch (e) {
    console.log('[Supply] Audit log skipped');
  }
  
  return {
    sent: true,
    po_number: po.po_number,
    to: supplierEmail,
    sent_at: po.sent_at
  };
}

/**
 * 物流跟踪（mock）
 */
async function trackShipment(trackingNumber, carrier = 'fedex') {
  // 模拟物流信息
  const mockTracking = {
    'fedex': {
      status: 'in_transit',
      current_location: 'Hong Kong',
      events: [
        { date: '2026-03-18', event: 'Departed facility', location: 'Shenzhen, CN' },
        { date: '2026-03-17', event: 'Arrived at facility', location: 'Shenzhen, CN' },
        { date: '2026-03-16', event: 'Picked up', location: 'Factory, CN' }
      ],
      estimated_delivery: '2026-03-20'
    },
    'dhl': {
      status: 'in_transit',
      current_location: 'HK',
      events: [
        { date: '2026-03-18', event: 'In transit', location: 'HK' }
      ],
      estimated_delivery: '2026-03-21'
    }
  };
  
  return {
    tracking_number: trackingNumber,
    carrier,
    ...(mockTracking[carrier] || mockTracking['fedex']),
    queried_at: new Date().toISOString()
  };
}

module.exports = {
  generatePO,
  sendPOToSupplier,
  trackShipment,
  PO_STATUS
};
