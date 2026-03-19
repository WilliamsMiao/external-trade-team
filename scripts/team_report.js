#!/usr/bin/env node
/**
 * 团队自然语言报告
 * 从 /team-report 拉取并输出可读总结
 */

const baseUrl = process.env.REPORT_BASE_URL || 'http://localhost:18789';
const limit = Number(process.argv[2] || 5);

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
  return map[stage] || '进行中';
}

async function main() {
  const url = `${baseUrl}/team-report?limit=${encodeURIComponent(limit)}`;
  const resp = await fetch(url);
  const data = await resp.json();

  if (!resp.ok || !data.ok) {
    console.error('❌ 获取团队报告失败:', data.error || resp.statusText);
    process.exit(1);
  }

  console.log('===========================================');
  console.log('团队业务报告（Manager View）');
  console.log('===========================================');
  console.log(`生成时间: ${data.generatedAt}`);
  console.log('');
  console.log(`总览: ${data.teamSummary}`);
  if (data.business) {
    console.log(`商机池: ${money(data.business.pipelinePotential)} | 预期转化: ${money(data.business.pipelineExpected)} | 已成交: ${money(data.business.closedRevenue)}`);
    console.log(`未报价意向: ${data.business.unquotedOpportunities}`);
  }
  console.log('');

  console.log('【各 Agent 在做什么】');
  for (const agent of data.agents) {
    console.log(`- ${agent.name} (${agent.type})`);
    console.log(`  ${agent.roleSummary}`);
  }

  console.log('');
  console.log('【最近商机与执行】');
  for (const task of data.tasks) {
    console.log(`- ${task.title || task.taskId} | 优先级: ${task.priority} | 负责人: ${task.assignedAgent || '-'}`);
    if (task.commercial) {
      console.log(`  阶段: ${stageLabel(task.commercial.stage)} | 潜在金额: ${money(task.commercial.potentialDealValue)} | 概率: ${(Number(task.commercial.probability || 0) * 100).toFixed(0)}% | 期望: ${money(task.commercial.expectedValue)}`);
    }
    console.log(`  过程: ${task.summary.replace(/任务\s+TSK-[^：]+：/g, '')}`);
    if (task.outputs && task.outputs.length > 0) {
      console.log(`  产出: ${task.outputs.join('；')}`);
    } else {
      console.log('  产出: 暂无结构化产出（建议补齐关键节点）');
    }
  }

  console.log('');
  console.log('提示: 可用 make demo 触发新工作流，再运行 make report 查看最新自然语言结果。');
}

main().catch((err) => {
  console.error('❌ 报告生成失败:', err.message);
  process.exit(1);
});
