#!/usr/bin/env node
/**
 * Agent 交互入口（命令行）
 * 用法:
 *   node scripts/agent_console.js sales "客户询价300件sensor预算9000"
 *   node scripts/agent_console.js briefing
 */

const baseUrl = process.env.REPORT_BASE_URL || 'http://localhost:18789';

function money(v) {
  const n = Number(v || 0);
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

async function callApi(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, options);
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

function printInteract(result) {
  console.log('===========================================');
  console.log(`业务助手: ${result.agent}`);
  console.log('===========================================');
  console.log(`结论: ${result.summary}`);
  console.log('');
  console.log('关键信息:');
  for (const d of result.details || []) {
    console.log(`- ${d}`);
  }
  console.log('');
  console.log('结构化产出:');
  for (const o of result.outputs || []) {
    if (o.type === 'route' && o.value?.business) {
      console.log(`- 路由: ${o.value.recommended_lead} (置信度 ${o.value.confidence})`);
      console.log(`  商机: 潜在 ${money(o.value.business.potentialDealValue)} / 期望 ${money(o.value.business.expectedDealValue)}`);
      continue;
    }
    if (o.type === 'lead_discovery' && o.value) {
      console.log(`- 获客: 线索 ${o.value.total} 条，高质量 ${o.value.qualified} 条，完整率 ${((o.value.structuredRate || 0) * 100).toFixed(1)}%`);
      continue;
    }
    if (o.type === 'quality' && o.value) {
      console.log(`- 质量门禁: ${o.value.pass ? 'PASS' : 'REVIEW'}（结构化 ${(Number(o.value.structuredRate || 0) * 100).toFixed(1)}%）`);
      continue;
    }
    const value = typeof o.value === 'string' ? o.value : JSON.stringify(o.value);
    console.log(`- ${o.type}: ${value}`);
  }
}

function printDashboard(data) {
  console.log('===========================================');
  console.log('外贸业务驾驶舱（Manager View）');
  console.log('===========================================');
  console.log(`时间: ${data.generatedAt}`);
  console.log(`商机池总额: ${money(data.headline.pipelinePotential)} | 预期转化: ${money(data.headline.pipelineExpected)} | 已成交: ${money(data.headline.closedRevenue)}`);
  console.log(`未报价意向: ${data.headline.unquotedOpportunities}`);
  console.log(`任务状态: 待处理 ${data.quality.pending} | 执行中 ${data.quality.inProgress} | 已完成 ${data.quality.completed}`);
  console.log('');
  console.log('管理建议:');
  for (const item of data.focus || []) {
    console.log(`- ${item}`);
  }
}

function printBriefing(data) {
  console.log('===========================================');
  console.log('团队简报（清晰版）');
  console.log('===========================================');
  console.log(`时间: ${data.generatedAt}`);
  console.log(
    `任务: 待处理 ${data.summary.pending || 0} | 执行中 ${data.summary.in_progress || 0} | 已完成 ${data.summary.completed || 0}`
  );
  console.log('');
  console.log('各 Agent 更新:');
  for (const a of data.agentDigest || []) {
    console.log(`- ${a.name}: ${a.updates.join('；')}`);
  }
  console.log('');
  console.log('团队产出:');
  for (const t of data.outputs || []) {
    const out = (t.outputs || []).length ? t.outputs.join('；') : '暂无';
    console.log(`- ${t.taskId} [${t.status}] => ${out}`);
  }
}

async function main() {
  const mode = (process.argv[2] || '').toLowerCase();

  if (!mode) {
    console.log('用法: node scripts/agent_console.js <agent|briefing|dashboard> [message]');
    console.log('agent: coordinator/hr/sales/acquisition/selection/supply/ops/finance');
    process.exit(0);
  }

  if (mode === 'briefing') {
    const data = await callApi('/briefing?limit=5');
    printBriefing(data);
    return;
  }

  if (mode === 'dashboard') {
    const data = await callApi('/manager-dashboard?limit=8');
    printDashboard(data);
    return;
  }

  const message = process.argv.slice(3).join(' ').trim();
  if (!message) {
    throw new Error('message is required for agent interaction');
  }

  const data = await callApi('/agent/interact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent: mode, message }),
  });

  printInteract(data.result);
}

main().catch((err) => {
  console.error('❌ 交互失败:', err.message);
  process.exit(1);
});
