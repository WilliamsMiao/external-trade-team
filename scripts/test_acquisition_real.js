#!/usr/bin/env node
/**
 * 真实互联网获客测试
 */

const { CustomerAcquisition } = require('../src/sales/customer_acquisition');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

(async () => {
  console.log('===========================================');
  console.log('Acquisition Agent 真实数据测试');
  console.log('===========================================');

  const manager = new CustomerAcquisition({ dataDir: './data' });

  const discovery = await manager.discoverLeadsOnline(
    'wireless earbuds importer distributor germany b2b',
    { maxResults: 12 }
  );

  assert(discovery && Array.isArray(discovery.leads), 'leads 结构无效');
  assert(discovery.leads.length > 0, '未抓取到潜在客户线索');

  const required = ['company', 'url', 'domain', 'snippet', 'score'];
  const first = discovery.leads[0];
  for (const key of required) {
    assert(first[key] !== undefined && first[key] !== null, `线索字段缺失: ${key}`);
  }

  const qualified = discovery.leads.filter((l) => l.qualified).length;
  const structuredRate = discovery.leads.filter((l) =>
    required.every((f) => l[f] !== undefined && l[f] !== null && String(l[f]).length > 0)
  ).length / discovery.leads.length;
  const contactCoverage = discovery.leads.filter((l) =>
    (Array.isArray(l.emails) && l.emails.length > 0) || (Array.isArray(l.phones) && l.phones.length > 0)
  ).length / discovery.leads.length;

  assert(structuredRate >= 0.8, `结构化完整率过低: ${structuredRate}`);
  assert(qualified >= 1, '高质量线索数不足');

  console.log(`采集模式: ${discovery.mode}`);
  console.log(`抓取线索: ${discovery.total}`);
  console.log(`高质量线索: ${qualified}`);
  console.log(`结构化完整率: ${(structuredRate * 100).toFixed(1)}%`);
  console.log(`联系方式覆盖率: ${(contactCoverage * 100).toFixed(1)}%`);
  console.log('');
  console.log('样例线索:');
  console.log(JSON.stringify(first, null, 2));

  const inquiryResult = await manager.processInquiry({
    text: '客户来自德国，询价500件蓝牙音箱，预算15000美元',
    source: 'manual',
    email: 'buyer@example.com',
    company: 'Example Import GmbH',
  });

  assert(inquiryResult.customer && inquiryResult.quote, 'processInquiry 产出不完整');
  console.log('');
  console.log(`询盘处理产出: customer=${inquiryResult.customer.id}, quote=${inquiryResult.quote.id}`);
  console.log('✅ Acquisition Agent 测试完成');
})().catch((err) => {
  console.error('❌ Acquisition Agent 测试失败:', err.message);
  process.exit(1);
});
