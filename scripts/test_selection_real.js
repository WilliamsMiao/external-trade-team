#!/usr/bin/env node
/**
 * 真实互联网选品测试
 */

const selection = require('../src/selection');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

(async () => {
  console.log('===========================================');
  console.log('Selection Agent 真实数据测试');
  console.log('===========================================');

  const result = await selection.runInternetSelectionPipeline(
    {
      keywords: ['wireless earbuds'],
      budget: 15000,
      quantity: 300,
      market: 'US',
    },
    {
      pageSize: 20,
    }
  );

  assert(result && result.source, '缺少 source 信息');
  assert(Array.isArray(result.products), 'products 必须是数组');
  assert(result.products.length > 0, '未采集到商品数据');
  assert(result.source.quality && typeof result.source.quality.pass === 'boolean', '缺少 source quality 指标');

  const requiredFields = ['name', 'price', 'currency', 'source', 'url'];
  const first = result.products[0];
  for (const key of requiredFields) {
    assert(first[key] !== undefined && first[key] !== null, `商品字段缺失: ${key}`);
  }

  const structuredRate = result.products.filter((p) =>
    requiredFields.every((f) => p[f] !== undefined && p[f] !== null && String(p[f]).length > 0)
  ).length / result.products.length;

  const minStructuredRate = 0.8;
  assert(structuredRate >= minStructuredRate, `结构化完整率低于阈值: ${structuredRate}`);
  assert(result.quality && typeof result.quality.pass === 'boolean', '缺少 quality 质量门禁结果');

  console.log(`数据源模式: ${result.source.mode}`);
  console.log(`数据源提供方: ${result.source.provider}`);
  console.log(`抓取总量: ${result.source.totalFetched}`);
  console.log(`来源质量门禁: ${result.source.quality.pass ? 'PASS' : 'REVIEW'}`);
  console.log(`结构化完整率: ${(structuredRate * 100).toFixed(1)}%`);
  console.log(`质量门禁: ${result.quality.pass ? 'PASS' : 'REVIEW'}`);
  console.log(`推荐产品: ${result.recommendation?.product?.name || 'N/A'}`);
  console.log(`推荐动作: ${result.recommendation?.action || 'N/A'}`);
  console.log('');
  console.log('样例商品:');
  console.log(JSON.stringify(first, null, 2));

  if (result.source.mode !== 'real_api') {
    console.log('⚠️ 当前不是 real_api，可能触发了 mock 回退。请检查网络或目标站可达性。');
  }

  console.log('✅ Selection Agent 测试完成');
})().catch((err) => {
  console.error('❌ Selection Agent 测试失败:', err.message);
  process.exit(1);
});
