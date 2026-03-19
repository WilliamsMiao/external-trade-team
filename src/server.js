#!/usr/bin/env node
/**
 * Production API server for external-trade-team.
 */

const http = require('http');
const { URL } = require('url');
const { Pool } = require('pg');
const { routeTaskToLead } = require('./coordinator/route_task');
const { parseInquiry, INQUIRY_SOURCE } = require('./sales/parse_inquiry');
const { generateQuote } = require('./sales/generate_quote');
const { checkInventory } = require('./supply/check_inventory');
const { scheduleProduction } = require('./ops/schedule_production');
const { generateInvoice } = require('./finance/generate_invoice');
const selectionModule = require('./selection');
const { CustomerAcquisition } = require('./sales/customer_acquisition');

const PORT = Number(process.env.PORT || 18789);
const HOST = process.env.HOST || '0.0.0.0';

const dbPool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
  : null;

const withTimeout = (promise, ms, message) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);

const AGENT_MAP = {
  coordinator: { id: 1, name: 'Coordinator', type: 'coordinator' },
  hr: { id: 2, name: 'HR Trainer', type: 'hr_trainer' },
  sales: { id: 3, name: 'Sales Lead', type: 'sales_lead' },
  acquisition: { id: 7, name: 'Acquisition Agent', type: 'acquisition_agent' },
  selection: { id: 8, name: 'Selection Agent', type: 'selection_agent' },
  supply: { id: 4, name: 'Supply Lead', type: 'supply_lead' },
  ops: { id: 5, name: 'Ops Lead', type: 'ops_lead' },
  finance: { id: 6, name: 'Finance Lead', type: 'finance_lead' },
};

const normalizeAgentKey = (value = '') => {
  const k = String(value).trim().toLowerCase();
  if (k in AGENT_MAP) return k;
  if (k === 'hr_trainer') return 'hr';
  if (k === 'sales_lead') return 'sales';
  if (k === 'acquisition_agent') return 'acquisition';
  if (k === 'selection_agent') return 'selection';
  if (k === 'supply_lead') return 'supply';
  if (k === 'ops_lead') return 'ops';
  if (k === 'finance_lead') return 'finance';
  return null;
};

const createTaskId = () => `TSK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

function readJsonBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (Buffer.byteLength(data) > maxBytes) {
        reject(new Error('payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

async function findAgentByType(client, type) {
  const result = await client.query(
    `SELECT id, name, type FROM agents WHERE type = $1 AND status = 'active' ORDER BY id ASC LIMIT 1`,
    [type]
  );
  return result.rows[0] || null;
}

async function touchAgent(client, type) {
  await client.query(
    `UPDATE agents
     SET last_activity = CURRENT_TIMESTAMP
     WHERE type = $1`,
    [type]
  );
}

async function insertAudit(client, { agentId, action, targetType, targetId, details }) {
  await client.query(
    `INSERT INTO audit_log (agent_id, action, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [agentId, action, targetType, targetId, JSON.stringify(details || {})]
  );
}

async function runInquiryWorkflow(payload = {}) {
  if (!dbPool) {
    throw new Error('DATABASE_URL is not configured');
  }

  const inputText =
    payload.inquiryText ||
    '客户 ABC Trading 询价 500 件 electronics，预算 $15000，30 天内交付到 USA';
  const customerEmail = payload.customerEmail || 'buyer@abctrading.com';
  const priority = payload.priority || 'high';

  const route = routeTaskToLead(inputText);
  const assignedType = route.recommended_lead === 'coordinator' ? 'sales_lead' : route.recommended_lead;

  const client = await dbPool.connect();
  const taskId = createTaskId();
  let assignedAgent = null;

  try {
    await client.query('BEGIN');

    assignedAgent = await findAgentByType(client, assignedType);
    if (!assignedAgent) {
      throw new Error(`no active agent found for type=${assignedType}`);
    }

    await client.query(
      `INSERT INTO tasks (task_id, title, description, assigned_agent_id, related_type, priority, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7::jsonb)`,
      [
        taskId,
        'Inquiry orchestration',
        inputText,
        assignedAgent.id,
        'inquiry',
        priority,
        JSON.stringify({ route, source: 'api_workflow' }),
      ]
    );

    await insertAudit(client, {
      agentId: 1,
      action: 'workflow_received',
      targetType: 'task',
      targetId: taskId,
      details: { route, assigned_agent: assignedAgent.name },
    });

    await touchAgent(client, 'coordinator');

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  try {
    const execClient = await dbPool.connect();
    try {
      await execClient.query('BEGIN');
      await execClient.query(
        `UPDATE tasks
         SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP
         WHERE task_id = $1`,
        [taskId]
      );
      await touchAgent(execClient, assignedType);
      await insertAudit(execClient, {
        agentId: assignedAgent.id,
        action: 'task_started',
        targetType: 'task',
        targetId: taskId,
        details: { assigned_type: assignedType },
      });
      await execClient.query('COMMIT');
    } catch (error) {
      await execClient.query('ROLLBACK');
      throw error;
    } finally {
      execClient.release();
    }

    const inquiry = await parseInquiry(inputText, INQUIRY_SOURCE.MANUAL, { customerEmail });
    const quote = await generateQuote(inquiry, { margin: 0.18, incoterms: 'FOB' });
    const inventory = await checkInventory(inquiry.products[0] || 'electronics', inquiry.quantity || 100);
    const production = await scheduleProduction({
      product: inquiry.products[0] || 'electronics',
      quantity: inquiry.quantity || 100,
      priority: 'urgent',
    });
    const invoice = await generateInvoice(
      {
        customerId: 'cust-001',
        orderId: inquiry.id,
        items: [
          {
            description: (inquiry.products || ['product']).join(','),
            quantity: inquiry.quantity || 100,
            unitPrice: Number((quote.pricing.total / (inquiry.quantity || 100)).toFixed(2)),
          },
        ],
      },
      { paymentTerms: 'Net 30' }
    );

    const completeClient = await dbPool.connect();
    try {
      await completeClient.query('BEGIN');
      await completeClient.query(
        `UPDATE tasks
         SET status = 'completed',
             related_id = id,
             completed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP,
             metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
         WHERE task_id = $1`,
        [
          taskId,
          JSON.stringify({
            inquiry_id: inquiry.id,
            quote_id: quote.id,
            production_id: production.id,
            invoice_number: invoice.invoice_number,
            inventory_status: inventory.status,
          }),
        ]
      );

      await touchAgent(completeClient, 'sales_lead');
      await touchAgent(completeClient, 'supply_lead');
      await touchAgent(completeClient, 'ops_lead');
      await touchAgent(completeClient, 'finance_lead');

      await insertAudit(completeClient, {
        agentId: 1,
        action: 'workflow_completed',
        targetType: 'task',
        targetId: taskId,
        details: {
          inquiry_id: inquiry.id,
          quote_id: quote.id,
          invoice_number: invoice.invoice_number,
          production_id: production.id,
        },
      });
      await completeClient.query('COMMIT');
    } catch (error) {
      await completeClient.query('ROLLBACK');
      throw error;
    } finally {
      completeClient.release();
    }

    return {
      ok: true,
      taskId,
      route,
      inquiry,
      quote,
      inventory,
      production,
      invoice,
    };
  } catch (error) {
    const failClient = await dbPool.connect();
    try {
      await failClient.query('BEGIN');
      await failClient.query(
        `UPDATE tasks
         SET status = 'cancelled',
             updated_at = CURRENT_TIMESTAMP,
             metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
         WHERE task_id = $1`,
        [taskId, JSON.stringify({ error: error.message })]
      );
      await insertAudit(failClient, {
        agentId: 1,
        action: 'workflow_failed',
        targetType: 'task',
        targetId: taskId,
        details: { error: error.message },
      });
      await failClient.query('COMMIT');
    } catch {
      await failClient.query('ROLLBACK');
    } finally {
      failClient.release();
    }
    throw error;
  }
}

async function collectRuntimeStatus() {
  if (!dbPool) {
    return {
      ok: false,
      error: 'DATABASE_URL is not configured',
    };
  }

  const client = await dbPool.connect();
  try {
    const [
      agentsRes,
      taskSummaryRes,
      taskQueueRes,
      recentAuditRes,
      dbClockRes,
    ] = await Promise.all([
      client.query(
        `SELECT id, name, type, status, last_activity
         FROM agents
         ORDER BY id ASC`
      ),
      client.query(
        `SELECT status, COUNT(*)::int AS count
         FROM tasks
         GROUP BY status
         ORDER BY status ASC`
      ),
      client.query(
        `SELECT task_id, title, priority, status, created_at, updated_at
         FROM tasks
         WHERE status IN ('pending', 'in_progress')
         ORDER BY updated_at DESC
         LIMIT 10`
      ),
      client.query(
        `SELECT a.timestamp, ag.name AS agent_name, a.action, a.target_type, a.target_id
         FROM audit_log a
         LEFT JOIN agents ag ON ag.id = a.agent_id
         ORDER BY a.timestamp DESC
         LIMIT 10`
      ),
      client.query(`SELECT NOW() AS now`),
    ]);

    const taskSummary = {};
    for (const row of taskSummaryRes.rows) {
      taskSummary[row.status] = row.count;
    }

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      databaseTime: dbClockRes.rows[0]?.now,
      agents: agentsRes.rows,
      taskSummary,
      taskQueue: taskQueueRes.rows,
      recentAudit: recentAuditRes.rows,
    };
  } finally {
    client.release();
  }
}

async function checkDatabaseReady() {
  if (!dbPool) return false;
  const client = await dbPool.connect();
  try {
    await client.query('SELECT 1');
    return true;
  } finally {
    client.release();
  }
}

function formatTaskOutput(metadata = {}) {
  const outputs = [];
  if (metadata.inquiry_id) outputs.push(`询盘 ${metadata.inquiry_id}`);
  if (metadata.quote_id) outputs.push(`报价 ${metadata.quote_id}`);
  if (metadata.inventory_status) outputs.push(`库存状态 ${metadata.inventory_status}`);
  if (metadata.production_id) outputs.push(`生产单 ${metadata.production_id}`);
  if (metadata.invoice_number) outputs.push(`发票 ${metadata.invoice_number}`);
  return outputs;
}

function humanizeAction(action) {
  const map = {
    workflow_received: '接收并分解了工作流任务',
    task_started: '开始执行任务',
    quote_generated: '完成报价生成',
    inventory_checked: '完成库存核查',
    production_scheduled: '完成生产排程',
    invoice_generated: '完成发票生成',
    workflow_completed: '完成整条工作流交付',
  };
  return map[action] || `执行了动作 ${action}`;
}

function toNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function estimateTaskPotential(task = {}) {
  const metadata = task.metadata || {};
  const priority = (task.priority || 'medium').toLowerCase();
  const baseByPriority = { high: 12000, medium: 7000, low: 3500 };
  const probNoQuote = { high: 0.5, medium: 0.35, low: 0.2 };
  const probQuoted = { high: 0.72, medium: 0.56, low: 0.35 };

  const explicitBudget = toNumber(metadata.budget || metadata.estimated_budget, 0);
  const quantity = toNumber(metadata.quantity, 0);
  const unitPrice = toNumber(metadata.unit_price || metadata.estimated_unit_price, 0);
  const inferred = quantity > 0 && unitPrice > 0 ? quantity * unitPrice : 0;
  const potentialDealValue = Number((explicitBudget || inferred || baseByPriority[priority] || 5000).toFixed(2));

  const stage = metadata.invoice_number
    ? 'closed_won'
    : metadata.quote_id
      ? 'quoted_pending'
      : 'intent_unquoted';

  const probability = stage === 'closed_won'
    ? 1
    : stage === 'quoted_pending'
      ? (probQuoted[priority] || 0.45)
      : (probNoQuote[priority] || 0.3);

  return {
    stage,
    potentialDealValue,
    probability: Number(probability.toFixed(2)),
    expectedValue: Number((potentialDealValue * probability).toFixed(2)),
  };
}

function buildBusinessKpis(taskReports = []) {
  let pipelinePotential = 0;
  let pipelineExpected = 0;
  let closedRevenue = 0;
  let unquotedCount = 0;

  for (const t of taskReports) {
    const c = t.commercial || estimateTaskPotential(t);
    if (c.stage === 'closed_won') {
      closedRevenue += c.potentialDealValue;
      continue;
    }
    pipelinePotential += c.potentialDealValue;
    pipelineExpected += c.expectedValue;
    if (c.stage === 'intent_unquoted') unquotedCount += 1;
  }

  return {
    pipelinePotential: Number(pipelinePotential.toFixed(2)),
    pipelineExpected: Number(pipelineExpected.toFixed(2)),
    closedRevenue: Number(closedRevenue.toFixed(2)),
    unquotedOpportunities: unquotedCount,
  };
}

async function collectTeamNarrative(limit = 5) {
  if (!dbPool) {
    return {
      ok: false,
      error: 'DATABASE_URL is not configured',
    };
  }

  const client = await dbPool.connect();
  try {
    const [agentsRes, tasksRes, auditsRes] = await Promise.all([
      client.query(
        `SELECT id, name, type, status, last_activity
         FROM agents
         ORDER BY id ASC`
      ),
      client.query(
        `SELECT t.task_id, t.title, t.status, t.priority, t.created_at, t.updated_at,
                t.metadata, a.name AS assigned_agent, a.type AS assigned_type
         FROM tasks t
         LEFT JOIN agents a ON a.id = t.assigned_agent_id
         ORDER BY t.updated_at DESC
         LIMIT $1`,
        [Math.max(1, Math.min(limit, 20))]
      ),
      client.query(
        `SELECT al.timestamp, al.action, al.target_id, al.details,
                ag.name AS agent_name, ag.type AS agent_type
         FROM audit_log al
         LEFT JOIN agents ag ON ag.id = al.agent_id
         ORDER BY al.timestamp DESC
         LIMIT 200`
      ),
    ]);

    const auditsByTask = new Map();
    for (const row of auditsRes.rows) {
      const taskIdFromTarget = row.target_id && String(row.target_id).startsWith('TSK-')
        ? String(row.target_id)
        : null;
      const taskIdFromDetails = row.details && row.details.task_id ? String(row.details.task_id) : null;
      const key = taskIdFromTarget || taskIdFromDetails;
      if (!key) continue;
      if (!auditsByTask.has(key)) auditsByTask.set(key, []);
      auditsByTask.get(key).push(row);
    }

    const taskReports = tasksRes.rows.map((task) => {
      const taskAudits = (auditsByTask.get(task.task_id) || []).sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
      );

      const timeline = taskAudits.map((item) => {
        const who = item.agent_name || '系统';
        return `${who}${humanizeAction(item.action)}`;
      });

      const outputs = formatTaskOutput(task.metadata || {});
      const commercial = estimateTaskPotential(task);
      const summary =
        timeline.length > 0
          ? `任务 ${task.task_id}：${timeline.join(' -> ')}。`
          : `任务 ${task.task_id}：已创建，等待更多执行日志。`;

      return {
        taskId: task.task_id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        assignedAgent: task.assigned_agent,
        assignedType: task.assigned_type,
        summary,
        timeline,
        outputs,
        commercial,
        updatedAt: task.updated_at,
      };
    });

    const actionsByAgent = new Map();
    for (const row of auditsRes.rows) {
      const key = row.agent_name || '系统';
      if (!actionsByAgent.has(key)) actionsByAgent.set(key, []);
      if (actionsByAgent.get(key).length < 5) {
        actionsByAgent.get(key).push(humanizeAction(row.action));
      }
    }

    const agentReports = agentsRes.rows.map((agent) => {
      const actionList = actionsByAgent.get(agent.name) || [];
      const roleSummary =
        actionList.length > 0
          ? `${agent.name}最近主要工作：${Array.from(new Set(actionList)).join('、')}。`
          : `${agent.name}当前在线，等待新任务分配。`;
      return {
        id: agent.id,
        name: agent.name,
        type: agent.type,
        status: agent.status,
        lastActivity: agent.last_activity,
        roleSummary,
      };
    });

    const completed = taskReports.filter((t) => t.status === 'completed').length;
    const inProgress = taskReports.filter((t) => t.status === 'in_progress').length;
    const pending = taskReports.filter((t) => t.status === 'pending').length;
    const business = buildBusinessKpis(taskReports);

    const teamSummary = `当前团队共追踪 ${taskReports.length} 个任务，其中完成 ${completed} 个、执行中 ${inProgress} 个、待处理 ${pending} 个。当前商机池 $${business.pipelinePotential}，预期可转化 $${business.pipelineExpected}。`;

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      teamSummary,
      business,
      agents: agentReports,
      tasks: taskReports,
    };
  } finally {
    client.release();
  }
}

async function collectCleanBriefing(limit = 3) {
  if (!dbPool) {
    return {
      ok: false,
      error: 'DATABASE_URL is not configured',
    };
  }

  const client = await dbPool.connect();
  try {
    const [taskSummaryRes, recentTasksRes, recentAuditsRes, agentsRes] = await Promise.all([
      client.query(
        `SELECT status, COUNT(*)::int AS count
         FROM tasks
         GROUP BY status
         ORDER BY status ASC`
      ),
      client.query(
        `SELECT task_id, status, priority, metadata, updated_at
         FROM tasks
         ORDER BY updated_at DESC
         LIMIT $1`,
        [Math.max(1, Math.min(limit, 10))]
      ),
      client.query(
        `SELECT al.timestamp, al.action, al.target_id, ag.name AS agent_name, ag.type AS agent_type
         FROM audit_log al
         LEFT JOIN agents ag ON ag.id = al.agent_id
         ORDER BY al.timestamp DESC
         LIMIT 30`
      ),
      client.query(
        `SELECT id, name, type, last_activity
         FROM agents
         ORDER BY id ASC`
      ),
    ]);

    const summary = { pending: 0, in_progress: 0, completed: 0, cancelled: 0 };
    for (const row of taskSummaryRes.rows) {
      summary[row.status] = row.count;
    }

    const outputs = recentTasksRes.rows.map((row) => ({
      commercial: estimateTaskPotential(row),
      taskId: row.task_id,
      status: row.status,
      priority: row.priority,
      outputs: formatTaskOutput(row.metadata || {}),
      updatedAt: row.updated_at,
    }));

    const agentDigest = agentsRes.rows.map((agent) => {
      const actions = recentAuditsRes.rows
        .filter((a) => a.agent_type === agent.type)
        .slice(0, 2)
        .map((a) => humanizeAction(a.action));
      return {
        name: agent.name,
        type: agent.type,
        lastActivity: agent.last_activity,
        updates: actions.length ? actions : ['当前在线，等待新任务'],
      };
    });

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      summary,
      business: buildBusinessKpis(outputs),
      agentDigest,
      outputs,
    };
  } finally {
    client.release();
  }
}

async function collectManagerDashboard(limit = 8) {
  const [report, briefing] = await Promise.all([
    collectTeamNarrative(limit),
    collectCleanBriefing(Math.max(3, Math.min(limit, 10))),
  ]);

  if (!report.ok || !briefing.ok) {
    return {
      ok: false,
      error: report.error || briefing.error || 'failed to build manager dashboard',
    };
  }

  const topOpportunities = (report.tasks || [])
    .filter((t) => t.commercial && t.commercial.stage !== 'closed_won')
    .sort((a, b) => Number(b.commercial.expectedValue || 0) - Number(a.commercial.expectedValue || 0))
    .slice(0, 5)
    .map((t) => ({
      taskId: t.taskId,
      priority: t.priority,
      stage: t.commercial.stage,
      potentialDealValue: t.commercial.potentialDealValue,
      probability: t.commercial.probability,
      expectedValue: t.commercial.expectedValue,
      owner: t.assignedAgent || 'unassigned',
    }));

  const focus = [];
  if ((report.business?.unquotedOpportunities || 0) > 0) {
    focus.push(`有 ${report.business.unquotedOpportunities} 个意向客户尚未报价，建议优先补齐报价并跟进。`);
  }
  if ((briefing.summary?.pending || 0) > 0) {
    focus.push(`当前仍有 ${briefing.summary.pending} 个待处理任务，建议集中清理高优先级任务。`);
  }
  if ((report.business?.pipelineExpected || 0) < (report.business?.pipelinePotential || 0) * 0.45) {
    focus.push('商机转化效率偏低，建议强化报价速度与客户触达频次。');
  }

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    headline: {
      pipelinePotential: report.business.pipelinePotential,
      pipelineExpected: report.business.pipelineExpected,
      closedRevenue: report.business.closedRevenue,
      unquotedOpportunities: report.business.unquotedOpportunities,
    },
    quality: {
      pending: briefing.summary.pending || 0,
      inProgress: briefing.summary.in_progress || 0,
      completed: briefing.summary.completed || 0,
    },
    topOpportunities,
    focus: focus.length ? focus : ['运行状态正常，建议继续扩大高质量获客规模。'],
  };
}

async function logAgentConversation(agent, prompt, response, extra = {}) {
  if (!dbPool) return;
  const client = await dbPool.connect();
  try {
    await insertAudit(client, {
      agentId: agent.id,
      action: 'agent_reply',
      targetType: 'conversation',
      targetId: `CHAT-${Date.now().toString(36).toUpperCase()}`,
      details: {
        prompt,
        responseSummary: response.summary,
        ...extra,
      },
    });
    await touchAgent(client, agent.type);
  } finally {
    client.release();
  }
}

async function interactWithAgent(agentKey, payload = {}) {
  const normalized = normalizeAgentKey(agentKey);
  if (!normalized) {
    throw new Error('unknown agent, expected one of: coordinator/hr/sales/supply/ops/finance');
  }

  const agent = AGENT_MAP[normalized];
  const message = (payload.message || '').toString().trim();
  const ctx = payload.context || {};

  if (!message) {
    throw new Error('message is required');
  }

  let result;

  if (normalized === 'coordinator') {
    const route = routeTaskToLead(message);
    const runtime = await collectRuntimeStatus();
    result = {
      agent: agent.name,
      summary: `我已完成任务分诊，建议由 ${route.recommended_lead} 负责，置信度 ${route.confidence}。`,
      details: [
        `任务内容：${message}`,
        `路由原因：${route.reason}`,
        `预计机会金额：$${route.business?.potentialDealValue || 0}，期望价值：$${route.business?.expectedDealValue || 0}`,
        runtime.ok
          ? `当前执行面板：已完成 ${runtime.taskSummary.completed || 0}，执行中 ${runtime.taskSummary.in_progress || 0}，待处理 ${runtime.taskSummary.pending || 0}`
          : '当前执行面板暂不可用',
      ],
      outputs: [{ type: 'route', value: route }],
    };
  } else if (normalized === 'sales') {
    const inquiry = await parseInquiry(message, INQUIRY_SOURCE.MANUAL, {
      customerEmail: ctx.customerEmail || 'buyer@example.com',
    });
    const quote = await generateQuote(inquiry, { margin: 0.18, incoterms: 'FOB' });
    result = {
      agent: agent.name,
      summary: `询盘已解析并完成报价，报价单 ${quote.id}，总价 $${quote.pricing.total}。`,
      details: [
        `识别产品：${(inquiry.products || []).join(', ') || 'product'}`,
        `需求数量：${inquiry.quantity || '未明确'}`,
        `预算：${inquiry.budget ? `$${inquiry.budget.amount}` : '未给出'}`,
      ],
      outputs: [
        { type: 'inquiry', value: inquiry.id },
        { type: 'quote', value: quote.id },
      ],
    };
  } else if (normalized === 'acquisition') {
    const manager = new CustomerAcquisition({ dataDir: './data' });
    const res = await manager.processInquiry({
      text: message,
      source: 'manual',
      email: ctx.customerEmail || 'lead@example.com',
      company: ctx.company || null,
      phone: ctx.phone || null,
    });

    const leadDiscovery = await manager.discoverLeadsOnline(
      ctx.leadQuery || `${res.inquiry.product || 'product'} importer distributor ${res.inquiry.country || 'global'}`,
      { maxResults: Number(ctx.maxResults || 8) }
    );

    result = {
      agent: agent.name,
      summary: `获客流程已完成：客户 ${res.customer.name}（${res.customer.tier}级），并抓取 ${leadDiscovery.total} 条外网潜在客户线索。`,
      details: [
        `询盘ID：${res.inquiry.id}`,
        `客户价值评分：${res.strategy.priority}`,
        `建议动作：${(res.strategy.actions || []).join('、')}`,
        `外网采集模式：${leadDiscovery.mode}`,
        `高质量线索：${leadDiscovery.qualified || 0}`,
        `结构化完整率：${((leadDiscovery.structuredRate || 0) * 100).toFixed(1)}%`,
        `联系方式覆盖率：${((leadDiscovery.contactCoverage || 0) * 100).toFixed(1)}%`,
      ],
      outputs: [
        { type: 'customer', value: res.customer.id },
        { type: 'inquiry', value: res.inquiry.id },
        { type: 'quote', value: res.quote.id },
        { type: 'lead_discovery', value: leadDiscovery },
      ],
    };
  } else if (normalized === 'selection') {
    const keywordSeed = message
      .replace(/[，,。.!?？]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 4);

    const pipeline = await selectionModule.runInternetSelectionPipeline(
      {
        keywords: keywordSeed.length ? keywordSeed : ['electronics'],
        budget: Number(ctx.budget || 12000),
        quantity: Number(ctx.quantity || 300),
        market: ctx.market || 'US',
      },
      {
        pageSize: Number(ctx.pageSize || 20),
        site: ctx.site || process.env.MELI_SITE || 'MLA',
        volume: Number(ctx.quantity || 300),
      }
    );

    const top = pipeline.recommendation || {};
    result = {
      agent: agent.name,
      summary: `选品分析完成：推荐 ${top.product?.name || '候选产品'}，预估利润率 ${top.margin || '-'}%，数据源 ${pipeline.source?.provider || 'unknown'}。`,
      details: [
        `候选产品数：${(pipeline.products || []).length}`,
        `采集模式：${pipeline.source?.mode || 'unknown'}`,
        `来源总量：${pipeline.source?.totalFetched || 0}`,
        `结构化完整率：${((pipeline.quality?.structuredRate || 0) * 100).toFixed(1)}%`,
        `质量门禁：${pipeline.quality?.pass ? 'PASS' : 'REVIEW'}`,
        `推荐动作：${top.action || 'REVIEW'}`,
        `建议供应商：${top.supplier || '待确认供应商'}`,
      ],
      outputs: [
        { type: 'selection_recommendation', value: top.product?.name || null },
        { type: 'roi', value: top.roi || null },
        { type: 'source', value: pipeline.source || null },
        { type: 'quality', value: pipeline.quality || null },
      ],
    };
  } else if (normalized === 'supply') {
    const product = ctx.product || message.split(/\s+/)[0] || 'electronics';
    const requiredQty = Number(ctx.quantity || 100);
    const inv = await checkInventory(product, requiredQty);
    result = {
      agent: agent.name,
      summary: `库存核查完成：${product} 当前 ${inv.quantity}，状态 ${inv.status}。`,
      details: [
        `需求数量：${requiredQty}`,
        `可满足：${inv.can_fulfill ? '是' : '否'}`,
        inv.shortage > 0 ? `缺口：${inv.shortage}` : '无缺口',
      ],
      outputs: [{ type: 'inventory', value: inv }],
    };
  } else if (normalized === 'ops') {
    const product = ctx.product || 'electronics';
    const quantity = Number(ctx.quantity || 300);
    const plan = await scheduleProduction({ product, quantity, priority: 'urgent' });
    result = {
      agent: agent.name,
      summary: `生产排程已下发：生产单 ${plan.id}，预计完成 ${plan.scheduled_end}。`,
      details: [
        `产品：${plan.product}`,
        `数量：${plan.quantity}`,
        `周期：${plan.production_days} 天`,
      ],
      outputs: [{ type: 'production', value: plan.id }],
    };
  } else if (normalized === 'finance') {
    const quantity = Number(ctx.quantity || 100);
    const unitPrice = Number(ctx.unitPrice || 35);
    const invoice = await generateInvoice(
      {
        customerId: ctx.customerId || 'cust-001',
        orderId: ctx.orderId || `ORD-${Date.now().toString(36).toUpperCase()}`,
        items: [{ description: ctx.description || 'export goods', quantity, unitPrice }],
      },
      { paymentTerms: 'Net 30' }
    );
    result = {
      agent: agent.name,
      summary: `财务开票完成：发票 ${invoice.invoice_number}，金额 ${invoice.pricing.currency} ${invoice.pricing.total}。`,
      details: [
        `客户：${invoice.customer.name}`,
        `到期日：${invoice.terms.due_date}`,
        `支付条款：${invoice.terms.payment_terms}`,
      ],
      outputs: [{ type: 'invoice', value: invoice.invoice_number }],
    };
  } else {
    const brief = await collectCleanBriefing(3);
    result = {
      agent: agent.name,
      summary: 'HR 已生成团队协同简报，并给出训练关注点。',
      details: [
        `任务完成数：${brief.ok ? brief.summary.completed : 0}`,
        `执行中任务：${brief.ok ? brief.summary.in_progress : 0}`,
        '建议：重点提升跨部门交接时效与任务描述标准化。',
      ],
      outputs: [{ type: 'briefing', value: brief }],
    };
  }

  await logAgentConversation(agent, message, result, { agentKey: normalized });
  return result;
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // Basic CORS support for local tooling
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        ok: true,
        status: 'live',
        service: 'external-trade-team',
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/ready') {
    try {
      const dbReady = await withTimeout(
        checkDatabaseReady(),
        4000,
        'database readiness timed out'
      );
      const checks = {
        minimaxConfigured: Boolean(process.env.MINIMAX_API_KEY),
        databaseConfigured: Boolean(process.env.DATABASE_URL),
        databaseConnected: dbReady,
        redisConfigured: Boolean(process.env.REDIS_URL),
      };

      const ready =
        checks.minimaxConfigured &&
        checks.databaseConfigured &&
        checks.databaseConnected &&
        checks.redisConfigured;
      res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: ready, status: ready ? 'ready' : 'degraded', checks }));
    } catch (error) {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: false,
          status: 'degraded',
          checks: {
            minimaxConfigured: Boolean(process.env.MINIMAX_API_KEY),
            databaseConfigured: Boolean(process.env.DATABASE_URL),
            databaseConnected: false,
            redisConfigured: Boolean(process.env.REDIS_URL),
          },
          error: error.message,
        })
      );
    }
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/status') {
    try {
      const status = await withTimeout(
        collectRuntimeStatus(),
        6000,
        'status collection timed out'
      );
      const code = status.ok ? 200 : 503;
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(status));
    } catch (error) {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: false,
          error: error.message,
          status: 'degraded',
        })
      );
    }
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/tasks') {
    if (!dbPool) {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'DATABASE_URL is not configured' }));
      return;
    }

    const limit = Number(requestUrl.searchParams.get('limit') || 20);
    const client = await dbPool.connect();
    try {
      const result = await client.query(
        `SELECT t.task_id, t.title, t.priority, t.status, t.created_at, t.updated_at,
                a.name AS assigned_agent, a.type AS assigned_type
         FROM tasks t
         LEFT JOIN agents a ON a.id = t.assigned_agent_id
         ORDER BY t.updated_at DESC
         LIMIT $1`,
        [Math.max(1, Math.min(limit, 100))]
      );
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, tasks: result.rows }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: error.message }));
    } finally {
      client.release();
    }
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/team-report') {
    try {
      const limit = Number(requestUrl.searchParams.get('limit') || 5);
      const report = await withTimeout(
        collectTeamNarrative(limit),
        8000,
        'team report timed out'
      );
      const code = report.ok ? 200 : 503;
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(report));
    } catch (error) {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: error.message }));
    }
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/briefing') {
    try {
      const limit = Number(requestUrl.searchParams.get('limit') || 3);
      const briefing = await withTimeout(
        collectCleanBriefing(limit),
        8000,
        'briefing timed out'
      );
      const code = briefing.ok ? 200 : 503;
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(briefing));
    } catch (error) {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: error.message }));
    }
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/manager-dashboard') {
    try {
      const limit = Number(requestUrl.searchParams.get('limit') || 8);
      const dashboard = await withTimeout(
        collectManagerDashboard(limit),
        10000,
        'manager dashboard timed out'
      );
      const code = dashboard.ok ? 200 : 503;
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(dashboard));
    } catch (error) {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: error.message }));
    }
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/agents') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        ok: true,
        agents: Object.entries(AGENT_MAP).map(([key, value]) => ({ key, ...value })),
      })
    );
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/agent/interact') {
    try {
      const payload = await readJsonBody(req);
      const result = await withTimeout(
        interactWithAgent(payload.agent, payload),
        20000,
        'agent interaction timed out'
      );
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, result }));
    } catch (error) {
      const statusCode = error.message === 'invalid JSON payload' ? 400 : 500;
      res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: error.message }));
    }
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/workflow/demo') {
    try {
      const payload = await readJsonBody(req);
      const workflowResult = await withTimeout(
        runInquiryWorkflow(payload),
        30000,
        'workflow execution timed out'
      );
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(workflowResult));
    } catch (error) {
      const statusCode = error.message === 'invalid JSON payload' ? 400 : 500;
      res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: error.message }));
    }
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        ok: true,
        name: 'external-trade-team',
        endpoints: [
          '/health',
          '/ready',
          '/status',
          '/tasks',
          '/agents',
          '/briefing',
          '/manager-dashboard',
          '/team-report',
          '/agent/interact',
          '/workflow/demo'
        ],
      })
    );
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: false, error: 'Not Found' }));
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

server.listen(PORT, HOST, () => {
  console.log(`[external-trade-team] API listening on http://${HOST}:${PORT}`);
});

const gracefulShutdown = (signal) => {
  console.log(`[external-trade-team] Received ${signal}, shutting down gracefully...`);
  server.close((err) => {
    if (err) {
      console.error('[external-trade-team] Graceful shutdown failed:', err);
      process.exit(1);
    }
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[external-trade-team] Forced shutdown after timeout');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

if (dbPool) {
  process.on('beforeExit', async () => {
    await dbPool.end();
  });
}
