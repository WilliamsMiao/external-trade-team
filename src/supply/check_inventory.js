/**
 * Supply Lead - 库存检查工具
 * 
 * 检查产品库存情况
 */

const { logAction } = require('../audit');

/**
 * 库存状态
 */
const INVENTORY_STATUS = {
  IN_STOCK: 'in_stock',
  LOW_STOCK: 'low_stock',
  OUT_OF_STOCK: 'out_of_stock',
  ON_ORDER: 'on_order'
};

/**
 * 检查库存
 * 
 * @param {string} product - 产品名称/SKU
 * @param {number} requiredQty - 需求数量
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 库存信息
 */
async function checkInventory(product, requiredQty = 0, options = {}) {
  // 模拟数据库查询（实际应该查ERP）
  const inventory = await queryInventoryDB(product);
  
  // 计算是否满足需求
  const canFulfill = inventory.quantity >= requiredQty;
  const shortage = canFulfill ? 0 : requiredQty - inventory.quantity;
  
  // 确定状态
  let status = INVENTORY_STATUS.IN_STOCK;
  if (inventory.quantity === 0) {
    status = INVENTORY_STATUS.OUT_OF_STOCK;
  } else if (inventory.quantity < inventory.reorder_point) {
    status = INVENTORY_STATUS.IN_STOCK;
  } else if (inventory.on_order > 0 && inventory.quantity < requiredQty) {
    status = INVENTORY_STATUS.ON_ORDER;
  }
  
  const result = {
    product,
    sku: inventory.sku,
    status,
    quantity: inventory.quantity,
    required: requiredQty,
    can_fulfill: canFulfill,
    shortage,
    on_order: inventory.on_order,
    expected_restock: inventory.expected_restock,
    location: inventory.location,
    checked_at: new Date().toISOString()
  };
  
  // 记录审计日志
  try {
    await logAction(
      4, // Supply Lead agent ID
      'inventory_checked',
      'product',
      product,
      { requiredQty, canFulfill, status }
    );
  } catch (e) {
    console.log('[Supply] Audit log skipped');
  }
  
  console.log(`[Supply] Checked inventory for ${product}: ${status}, Qty: ${inventory.quantity}`);
  
  return result;
}

/**
 * 查询库存数据库（模拟）
 */
async function queryInventoryDB(product) {
  // 模拟数据库数据
  const mockInventory = {
    'widget': { sku: 'WDG-001', quantity: 500, reorder_point: 100, on_order: 0, expected_restock: null, location: 'Warehouse A' },
    'gadget': { sku: 'GDG-002', quantity: 50, reorder_point: 100, on_order: 200, expected_restock: '2026-03-25', location: 'Warehouse A' },
    'sensor': { sku: 'SNS-003', quantity: 0, reorder_point: 50, on_order: 0, expected_restock: null, location: 'Warehouse B' },
    'module': { sku: 'MDL-004', quantity: 200, reorder_point: 50, on_order: 0, expected_restock: null, location: 'Warehouse B' },
  };
  
  // 默认产品数据
  const normalized = product.toLowerCase();
  return mockInventory[normalized] || {
    sku: `SKU-${Date.now()}`,
    quantity: Math.floor(Math.random() * 500),
    reorder_point: 50,
    on_order: 0,
    expected_restock: null,
    location: 'Warehouse A'
  };
}

/**
 * 批量检查库存
 */
async function checkMultipleInventory(products) {
  const results = [];
  
  for (const item of products) {
    const product = typeof item === 'string' ? item : item.product;
    const qty = typeof item === 'object' ? item.quantity : 0;
    
    const result = await checkInventory(product, qty);
    results.push(result);
  }
  
  return {
    products: results,
    summary: {
      total: results.length,
      in_stock: results.filter(r => r.status === INVENTORY_STATUS.IN_STOCK).length,
      low_stock: results.filter(r => r.status === INVENTORY_STATUS.LOW_STOCK).length,
      out_of_stock: results.filter(r => r.status === INVENTORY_STATUS.OUT_OF_STOCK).length
    },
    checked_at: new Date().toISOString()
  };
}

module.exports = {
  checkInventory,
  checkMultipleInventory,
  INVENTORY_STATUS
};
