#!/usr/bin/env node
/**
 * 外贸管理驾驶舱（面向业务管理者）
 * 从 /manager-dashboard 拉取并输出业务指标
 */

const baseUrl = process.env.REPORT_BASE_URL || 'http://localhost:18789';
const limit = Number(process.argv[2] || 8);

function money(v) {
  const n = Number(v || 0);
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function stageLabel(stage) {
  const map = {
    intent_unquoted: '意向待报价',
    quoted_pending: '已报价待跟进',
    closed_won: '已成交',
  };
  return map[stage] || stage;
}

async function main() {
  const resp = await fetch(`${baseUrl}/manager-dashboard?limit=${encodeURIComponent(limit)}`);
  const data = await resp.json();

  if (!resp.ok || !data.ok) {
    throw new Error(data.error || `HTTP ${resp.status}`);
  }

  console.log('===========================================');
  console.log('外贸业务驾驶舱（Manager View）');
  console.log('===========================================');
  console.log(`时间: ${data.generatedAt}`);
  console.log('');
  console.log(`商机池总额: ${money(data.headline.pipelinePotential)}`);
  console.log(`预期可转化: ${money(data.headline.pipelineExpected)}`);
  console.log(`已成交收入: ${money(data.headline.closedRevenue)}`);
  console.log(`未报价意向: ${data.headline.unquotedOpportunities}`);
  console.log('');
  console.log(`任务状态: 待处理 ${data.quality.pending} | 执行中 ${data.quality.inProgress} | 已完成 ${data.quality.completed}`);
  console.log('');

  console.log('【Top 商机（按期望价值）】');
  for (const o of data.topOpportunities || []) {
    console.log(`- ${o.taskId} | ${stageLabel(o.stage)} | 负责人: ${o.owner}`);
    console.log(`  潜在金额: ${money(o.potentialDealValue)} | 概率: ${(Number(o.probability || 0) * 100).toFixed(0)}% | 期望: ${money(o.expectedValue)}`);
  }

  console.log('');
  console.log('【管理建议】');
  for (const f of data.focus || []) {
    console.log(`- ${f}`);
  }

  console.log('');
  console.log('提示: 可执行 make demo 触发新流程，再执行 make dashboard 查看变化。');
}

main().catch((err) => {
  console.error('❌ 驾驶舱生成失败:', err.message);
  process.exit(1);
});
