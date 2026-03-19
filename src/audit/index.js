/**
 * 审计日志模块 - audit/index.js
 * 
 * 提供 audit_log 和 config_change_log 的写入接口
 */

const { Pool } = require('pg');

/**
 * 获取数据库连接池
 */
function getPool() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL not set');
  }
  return new Pool({ connectionString: dbUrl });
}

/**
 * 记录业务操作日志
 * 
 * @param {number} agentId - Agent ID
 * @param {string} action - 操作名称
 * @param {string} targetType - 目标类型 (order/customer/supplier/invoice/shipment)
 * @param {string} targetId - 目标ID
 * @param {Object} details - 详细信息
 * @returns {Promise<Object>} 插入的日志记录
 */
async function logAction(agentId, action, targetType, targetId, details = {}) {
  const pool = getPool();
  
  try {
    const query = `
      INSERT INTO audit_log (agent_id, action, target_type, target_id, details)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const values = [agentId, action, targetType, targetId, JSON.stringify(details)];
    const result = await pool.query(query, values);
    console.log(`[Audit] Logged action: ${action} on ${targetType}:${targetId}`);
    return result.rows[0];
  } finally {
    await pool.end();
  }
}

/**
 * 记录配置变更日志
 * 
 * @param {string} agentName - Agent名称
 * @param {string} changeType - 变更类型 (create/update/deprecate/reactivate)
 * @param {Object} beforeState - 变更前状态
 * @param {Object} afterState - 变更后状态
 * @param {string} approvedBy - 审批人
 * @param {string} reason - 变更原因
 * @returns {Promise<Object>} 插入的日志记录
 */
async function logConfigChange(agentName, changeType, beforeState, afterState, approvedBy, reason = '') {
  const pool = getPool();
  
  try {
    const query = `
      INSERT INTO config_change_log 
        (agent_name, change_type, before_state, after_state, approved_by, reason)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const values = [
      agentName, 
      changeType, 
      JSON.stringify(beforeState), 
      JSON.stringify(afterState), 
      approvedBy,
      reason
    ];
    const result = await pool.query(query, values);
    console.log(`[Audit] Config change: ${agentName} - ${changeType}`);
    return result.rows[0];
  } finally {
    await pool.end();
  }
}

/**
 * 查询审计日志
 * 
 * @param {Object} filters - 过滤条件
 * @param {number} filters.agentId - Agent ID
 * @param {string} filters.action - 操作名称
 * @param {string} filters.targetType - 目标类型
 * @param {Date} filters.from - 开始时间
 * @param {Date} filters.to - 结束时间
 * @param {number} filters.limit - 返回数量
 * @returns {Promise<Array>} 日志列表
 */
async function queryAuditLog(filters = {}) {
  const pool = getPool();
  
  const conditions = [];
  const values = [];
  let idx = 1;

  if (filters.agentId) {
    conditions.push(`agent_id = $${idx++}`);
    values.push(filters.agentId);
  }
  if (filters.action) {
    conditions.push(`action = $${idx++}`);
    values.push(filters.action);
  }
  if (filters.targetType) {
    conditions.push(`target_type = $${idx++}`);
    values.push(filters.targetType);
  }
  if (filters.from) {
    conditions.push(`timestamp >= $${idx++}`);
    values.push(filters.from);
  }
  if (filters.to) {
    conditions.push(`timestamp <= $${idx++}`);
    values.push(filters.to);
  }

  const whereClause = conditions.length > 0 
    ? `WHERE ${conditions.join(' AND ')}` 
    : '';
  const limit = filters.limit || 100;

  const query = `
    SELECT * FROM audit_log 
    ${whereClause}
    ORDER BY timestamp DESC 
    LIMIT $${idx}
  `;
  values.push(limit);

  try {
    const result = await pool.query(query, values);
    return result.rows;
  } finally {
    await pool.end();
  }
}

/**
 * 查询配置变更日志
 * 
 * @param {Object} filters - 过滤条件
 * @param {string} filters.agentName - Agent名称
 * @param {string} filters.changeType - 变更类型
 * @param {string} filters.approvedBy - 审批人
 * @param {Date} filters.from - 开始时间
 * @param {Date} filters.to - 结束时间
 * @param {number} filters.limit - 返回数量
 * @returns {Promise<Array>} 变更日志列表
 */
async function queryConfigChangeLog(filters = {}) {
  const pool = getPool();
  
  const conditions = [];
  const values = [];
  let idx = 1;

  if (filters.agentName) {
    conditions.push(`agent_name = $${idx++}`);
    values.push(filters.agentName);
  }
  if (filters.changeType) {
    conditions.push(`change_type = $${idx++}`);
    values.push(filters.changeType);
  }
  if (filters.approvedBy) {
    conditions.push(`approved_by = $${idx++}`);
    values.push(filters.approvedBy);
  }
  if (filters.from) {
    conditions.push(`timestamp >= $${idx++}`);
    values.push(filters.from);
  }
  if (filters.to) {
    conditions.push(`timestamp <= $${idx++}`);
    values.push(filters.to);
  }

  const whereClause = conditions.length > 0 
    ? `WHERE ${conditions.join(' AND ')}` 
    : '';
  const limit = filters.limit || 100;

  const query = `
    SELECT * FROM config_change_log 
    ${whereClause}
    ORDER BY timestamp DESC 
    LIMIT $${idx}
  `;
  values.push(limit);

  try {
    const result = await pool.query(query, values);
    return result.rows;
  } finally {
    await pool.end();
  }
}

/**
 * 获取Agent的最新配置变更
 * 
 * @param {string} agentName - Agent名称
 * @returns {Promise<Object>} 最新变更记录
 */
async function getLatestConfigChange(agentName) {
  const pool = getPool();
  
  const query = `
    SELECT * FROM config_change_log 
    WHERE agent_name = $1
    ORDER BY timestamp DESC 
    LIMIT 1
  `;

  try {
    const result = await pool.query(query, [agentName]);
    return result.rows[0] || null;
  } finally {
    await pool.end();
  }
}

/**
 * 获取审计统计
 * 
 * @param {Object} filters - 过滤条件
 * @returns {Promise<Object>} 统计数据
 */
async function getAuditStats(filters = {}) {
  const pool = getPool();
  
  let whereClause = '';
  const values = [];
  let idx = 1;

  if (filters.from) {
    whereClause = `WHERE timestamp >= $${idx++}`;
    values.push(filters.from);
  }
  if (filters.to) {
    whereClause += (whereClause ? ' AND ' : 'WHERE ') + `timestamp <= $${idx++}`;
    values.push(filters.to);
  }

  const query = `
    SELECT 
      action,
      target_type,
      COUNT(*) as count
    FROM audit_log 
    ${whereClause}
    GROUP BY action, target_type
    ORDER BY count DESC
  `;

  try {
    const result = await pool.query(query, values);
    return result.rows;
  } finally {
    await pool.end();
  }
}

module.exports = {
  logAction,
  logConfigChange,
  queryAuditLog,
  queryConfigChangeLog,
  getLatestConfigChange,
  getAuditStats
};
