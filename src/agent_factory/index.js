/**
 * Agent Factory - 完整的 Agent 生命周期管理模块
 * 
 * 供 HR_Trainer 调用，实现 Agent 的创建/更新/停用
 */

const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');
const Ajv = require('ajv');

// Agent目录
const AGENTS_DIR = path.join(__dirname, '../../agents');
const TEMPLATES_DIR = path.join(__dirname, 'templates');

// 验证器
const ajv = new Ajv({ allErrors: true });

/**
 * 验证Agent规格
 */
function validateSpec(spec) {
  const schema = require('./schema.json');
  const validate = ajv.compile(schema);
  if (!validate(spec)) {
    throw new Error(`Invalid spec: ${JSON.stringify(validate.errors, null, 2)}`);
  }
  return true;
}

/**
 * 创建新Agent
 * 
 * @param {Object} spec - Agent规格
 * @param {string} spec.name - Agent名称 (必须)
 * @param {string} spec.type - Agent类型 (必须)
 * @param {string} spec.department - 部门 (必须)
 * @param {string} spec.description - 描述
 * @param {string[]} spec.responsibilities - 职责列表 (必须)
 * @param {string} spec.llm_model - LLM模型
 * @param {string[]} spec.tools - 工具列表
 * @param {string} spec.telegram_bot_token - Telegram Bot Token
 * @param {string[]} spec.groups - Telegram群组
 * @param {string} spec.approvedBy - 审批人
 * @returns {Promise<Object>} 创建结果
 */
async function createAgent(spec) {
  console.log(`[AgentFactory] Creating agent: ${spec.name}`);
  
  // 1. 验证输入
  validateSpec(spec);

  // 2. 检查Agent是否已存在
  const agentDir = path.join(AGENTS_DIR, spec.name);
  if (await fs.pathExists(agentDir)) {
    throw new Error(`Agent "${spec.name}" already exists. Use updateAgent instead.`);
  }

  // 3. 创建目录
  await fs.ensureDir(agentDir);
  await fs.ensureDir(path.join(agentDir, 'templates'));
  await fs.ensureDir(path.join(agentDir, 'prompts'));

  try {
    // 4. 生成config.json
    let configTemplate = await fs.readFile(
      path.join(TEMPLATES_DIR, 'config.json.template'), 
      'utf8'
    );
    
    const tools = spec.tools || ['log_audit'];
    const config = configTemplate
      .replace(/\{\{name\}\}/g, spec.name)
      .replace(/\{\{type\}\}/g, spec.type || 'specialist')
      .replace(/\{\{department\}\}/g, spec.department)
      .replace(/\{\{description\}\}/g, spec.description || '')
      .replace(/\{\{llm_model\}\}/g, spec.llm_model || '${MINIMAX_MODEL_GENERAL}')
      .replace(/\{\{tools\}\}/g, JSON.stringify(tools, null, 2))
      .replace(/\{\{created_at\}\}/g, new Date().toISOString())
      .replace(/\{\{updated_at\}\}/g, new Date().toISOString());
    
    await fs.writeFile(path.join(agentDir, 'config.json'), config);

    // 5. 生成identity.md
    let identityTemplate = await fs.readFile(
      path.join(TEMPLATES_DIR, 'identity.md.template'), 
      'utf8'
    );
    
    const identity = identityTemplate
      .replace(/\{\{name\}\}/g, spec.name)
      .replace(/\{\{description\}\}/g, spec.description || '')
      .replace(/\{\{department\}\}/g, spec.department)
      .replace(
        /\{\{responsibilities\}\}/g, 
        (spec.responsibilities || []).map(r => `- ${r}`).join('\n')
      );
    
    await fs.writeFile(path.join(agentDir, 'identity.md'), identity);

    // 6. 创建prompts目录占位
    await fs.writeFile(
      path.join(agentDir, 'prompts', 'system.md'), 
      `# ${spec.name}\n\nTODO: Add system prompt\n`
    );

    // 7. 更新agents.list
    await updateAgentsList(spec, 'create');

    // 8. 记录配置变更日志
    await logConfigChange({
      agentName: spec.name,
      changeType: 'create',
      beforeState: null,
      afterState: {
        name: spec.name,
        type: spec.type,
        department: spec.department,
        description: spec.description,
        responsibilities: spec.responsibilities,
        tools: spec.tools,
        groups: spec.groups
      },
      approvedBy: spec.approvedBy || 'hr_trainer'
    });

    console.log(`[AgentFactory] Agent created: ${spec.name}`);
    
    return {
      success: true,
      agent_name: spec.name,
      agent_path: agentDir,
      config_written: true,
      agents_list_updated: true,
      message: `Agent "${spec.name}" created successfully`
    };

  } catch (error) {
    // 清理已创建的目录
    await fs.remove(agentDir).catch(() => {});
    console.error(`[AgentFactory] Create failed: ${error.message}`);
    throw error;
  }
}

/**
 * 更新已有Agent
 * 
 * @param {string} name - Agent名称
 * @param {Object} updates - 更新内容
 * @param {string} updates.approvedBy - 审批人
 * @returns {Promise<Object>} 更新结果
 */
async function updateAgent(name, updates) {
  console.log(`[AgentFactory] Updating agent: ${name}`);
  
  const agentDir = path.join(AGENTS_DIR, name);
  const configPath = path.join(agentDir, 'config.json');
  
  if (!await fs.pathExists(configPath)) {
    throw new Error(`Agent "${name}" does not exist`);
  }

  // 读取旧配置
  const oldConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const beforeState = { ...oldConfig };

  // 合并更新（深合并）
  const newConfig = deepMerge(oldConfig, updates);
  newConfig.updated_at = new Date().toISOString();
  
  // 移除不应由用户更新的字段
  delete newConfig.approvedBy;

  // 写入新配置
  await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2));

  // 如果有identity更新
  if (updates.responsibilities || updates.description) {
    let identityTemplate = await fs.readFile(
      path.join(TEMPLATES_DIR, 'identity.md.template'), 
      'utf8'
    );
    
    const identity = identityTemplate
      .replace(/\{\{name\}\}/g, name)
      .replace(/\{\{description\}\}/g, updates.description || oldConfig.description || '')
      .replace(/\{\{department\}\}/g, oldConfig.department || '')
      .replace(
        /\{\{responsibilities\}\}/g, 
        (updates.responsibilities || oldConfig.responsibilities || []).map(r => `- ${r}`).join('\n')
      );
    
    await fs.writeFile(path.join(agentDir, 'identity.md'), identity);
  }

  // 更新agents.list
  await updateAgentsList({ name, ...updates }, 'update');

  // 记录变更
  await logConfigChange({
    agentName: name,
    changeType: 'update',
    beforeState: beforeState,
    afterState: newConfig,
    approvedBy: updates.approvedBy || 'hr_trainer',
    reason: updates.reason || ''
  });

  console.log(`[AgentFactory] Agent updated: ${name}`);
  
  return {
    success: true,
    agent_name: name,
    message: `Agent "${name}" updated successfully`
  };
}

/**
 * 停用Agent
 * 
 * @param {string} name - Agent名称
 * @param {string} reason - 停用原因
 * @param {string} approvedBy - 审批人
 * @returns {Promise<Object>} 停用结果
 */
async function deprecateAgent(name, reason = '', approvedBy = 'hr_trainer') {
  console.log(`[AgentFactory] Deprecating agent: ${name}`);
  
  const agentDir = path.join(AGENTS_DIR, name);
  const configPath = path.join(agentDir, 'config.json');
  
  if (!await fs.pathExists(configPath)) {
    throw new Error(`Agent "${name}" does not exist`);
  }

  // 读取配置
  const oldConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));

  // 更新状态为deprecated
  const newConfig = {
    ...oldConfig,
    status: 'deprecated',
    deprecated_at: new Date().toISOString(),
    deprecated_reason: reason
  };

  await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2));

  // 更新agents.list
  await updateAgentsList({ name, status: 'deprecated' }, 'deprecate');

  // 记录变更
  await logConfigChange({
    agentName: name,
    changeType: 'deprecate',
    beforeState: { ...oldConfig },
    afterState: { status: 'deprecated', reason },
    approvedBy,
    reason
  });

  console.log(`[AgentFactory] Agent deprecated: ${name}`);
  
  return {
    success: true,
    agent_name: name,
    message: `Agent "${name}" deprecated`
  };
}

/**
 * 重新激活Agent
 * 
 * @param {string} name - Agent名称
 * @param {string} approvedBy - 审批人
 * @returns {Promise<Object>}
 */
async function reactivateAgent(name, approvedBy = 'hr_trainer') {
  console.log(`[AgentFactory] Reactivating agent: ${name}`);
  
  const agentDir = path.join(AGENTS_DIR, name);
  const configPath = path.join(agentDir, 'config.json');
  
  if (!await fs.pathExists(configPath)) {
    throw new Error(`Agent "${name}" does not exist`);
  }

  const oldConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
  
  const newConfig = {
    ...oldConfig,
    status: 'active',
    reactivated_at: new Date().toISOString()
  };

  await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2));

  await updateAgentsList({ name, status: 'active' }, 'reactivate');

  await logConfigChange({
    agentName: name,
    changeType: 'reactivate',
    beforeState: { status: 'deprecated' },
    afterState: { status: 'active' },
    approvedBy
  });

  return {
    success: true,
    agent_name: name,
    message: `Agent "${name}" reactivated`
  };
}

/**
 * 获取Agent列表
 * 
 * @returns {Promise<Array>} Agent列表
 */
async function listAgents() {
  console.log(`[AgentFactory] Listing agents`);
  
  const entries = await fs.readdir(AGENTS_DIR, { withFileTypes: true });
  const agents = [];

  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      const configPath = path.join(AGENTS_DIR, entry.name, 'config.json');
      if (await fs.pathExists(configPath)) {
        try {
          const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
          agents.push({
            name: entry.name,
            type: config.type,
            department: config.department,
            status: config.status || 'active',
            description: config.description,
            created_at: config.created_at,
            updated_at: config.updated_at
          });
        } catch (e) {
          console.warn(`[AgentFactory] Failed to parse config for ${entry.name}:`, e.message);
        }
      }
    }
  }

  return agents;
}

/**
 * 获取单个Agent配置
 * 
 * @param {string} name - Agent名称
 * @returns {Promise<Object>} Agent配置
 */
async function getAgent(name) {
  console.log(`[AgentFactory] Getting agent: ${name}`);
  
  const agentDir = path.join(AGENTS_DIR, name);
  const configPath = path.join(agentDir, 'config.json');
  const identityPath = path.join(agentDir, 'identity.md');
  const systemPromptPath = path.join(agentDir, 'prompts', 'system.md');

  if (!await fs.pathExists(configPath)) {
    throw new Error(`Agent "${name}" does not exist`);
  }

  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  
  const identity = await fs.pathExists(identityPath) 
    ? await fs.readFile(identityPath, 'utf8') 
    : null;
  
  const systemPrompt = await fs.pathExists(systemPromptPath)
    ? await fs.readFile(systemPromptPath, 'utf8')
    : null;

  return {
    name,
    config,
    identity,
    systemPrompt,
    exists: true
  };
}

// ============ 辅助函数 ============

/**
 * 深合并对象
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * 更新agents.list文件
 */
async function updateAgentsList(spec, action) {
  const listFile = path.join(AGENTS_DIR, 'agents.json');
  let list = { agents: [] };

  if (await fs.pathExists(listFile)) {
    try {
      list = JSON.parse(await fs.readFile(listFile, 'utf8'));
    } catch (e) {
      list = { agents: [] };
    }
  }

  const existingIndex = list.agents.findIndex(a => a.name === spec.name);

  if (action === 'create') {
    if (existingIndex === -1) {
      list.agents.push({
        name: spec.name,
        type: spec.type,
        department: spec.department,
        status: 'active',
        created_at: new Date().toISOString()
      });
    }
  } else if (action === 'update' || action === 'deprecate' || action === 'reactivate') {
    if (existingIndex !== -1) {
      list.agents[existingIndex] = {
        ...list.agents[existingIndex],
        status: spec.status || list.agents[existingIndex].status,
        updated_at: new Date().toISOString()
      };
    }
  }

  await fs.writeFile(listFile, JSON.stringify(list, null, 2));
}

/**
 * 记录配置变更日志
 */
async function logConfigChange({ agentName, changeType, beforeState, afterState, approvedBy, reason }) {
  const dbUrl = process.env.DATABASE_URL;
  
  if (!dbUrl) {
    console.log('[AgentFactory] No DATABASE_URL, skipping config change log');
    return { logged: false, reason: 'no database' };
  }

  try {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: dbUrl });

    await pool.query(
      `INSERT INTO config_change_log 
       (agent_name, change_type, before_state, after_state, approved_by, reason) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [agentName, changeType, beforeState, afterState, approvedBy, reason || '']
    );

    await pool.end();
    
    console.log(`[AgentFactory] Config change logged: ${agentName} - ${changeType}`);
    return { logged: true };
  } catch (error) {
    console.error('[AgentFactory] Failed to log config change:', error.message);
    return { logged: false, error: error.message };
  }
}

module.exports = {
  createAgent,
  updateAgent,
  deprecateAgent,
  reactivateAgent,
  listAgents,
  getAgent,
  validateSpec,
  logConfigChange
};
