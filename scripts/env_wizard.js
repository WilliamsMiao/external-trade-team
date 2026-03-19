#!/usr/bin/env node
/**
 * 关键环境变量交互式向导
 * 用于 make start 前自动补齐生产必需配置
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
const envExamplePath = path.join(root, '.env.example');

if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
  fs.copyFileSync(envExamplePath, envPath);
}

if (!fs.existsSync(envPath)) {
  console.error('❌ 未找到 .env 或 .env.example');
  process.exit(1);
}

const raw = fs.readFileSync(envPath, 'utf8');
const lines = raw.split(/\r?\n/);

const envMap = {};
for (const line of lines) {
  if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
  const idx = line.indexOf('=');
  const key = line.slice(0, idx).trim();
  const value = line.slice(idx + 1).trim();
  if (key) envMap[key] = value;
}

const isPlaceholder = (key, value) => {
  if (!value) return true;
  const placeholderValues = new Set([
    'change_me',
    'change_me_secure_password',
    'change_me_pgadmin_password',
    'sk-your-minimax-key',
  ]);
  if (placeholderValues.has(value)) return true;
  if (key === 'MINIMAX_API_KEY' && value.startsWith('sk-your-')) return true;
  return false;
};

const questions = [
  {
    key: 'DB_PASSWORD',
    title: 'PostgreSQL 密码(DB_PASSWORD)',
    secret: true,
    validate: (v) => v.length >= 8,
    err: '至少 8 位',
  },
  {
    key: 'PGADMIN_PASSWORD',
    title: 'PgAdmin 密码(PGADMIN_PASSWORD)',
    secret: true,
    validate: (v) => v.length >= 8,
    err: '至少 8 位',
  },
  {
    key: 'MINIMAX_API_KEY',
    title: 'MiniMax API Key(MINIMAX_API_KEY)',
    secret: true,
    validate: (v) => v.length >= 10,
    err: '长度不合法',
  },
  {
    key: 'MINIMAX_API_BASE_URL',
    title: 'MiniMax API Base URL(MINIMAX_API_BASE_URL)',
    defaultValue: 'https://api.minimax.chat/v1',
    validate: (v) => /^https?:\/\//.test(v),
    err: '必须以 http:// 或 https:// 开头',
  },
];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(questionText) {
  return new Promise((resolve) => rl.question(questionText, resolve));
}

async function askOne(item) {
  const existing = envMap[item.key] || '';
  const hasValidExisting = !isPlaceholder(item.key, existing);

  while (true) {
    const label = hasValidExisting
      ? `${item.title} [已存在，回车保留]: `
      : `${item.title}${item.defaultValue ? ` [默认: ${item.defaultValue}]` : ''}: `;

    const answer = (await ask(label)).trim();
    const nextValue = answer || (hasValidExisting ? existing : (item.defaultValue || ''));

    if (!nextValue) {
      console.log('  ❌ 不能为空');
      continue;
    }

    if (item.validate && !item.validate(nextValue)) {
      console.log(`  ❌ ${item.err}`);
      continue;
    }

    envMap[item.key] = nextValue;
    break;
  }
}

function upsertEnv(content, key, value) {
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  const line = `${key}=${value}`;
  if (pattern.test(content)) return content.replace(pattern, line);
  const trimmed = content.endsWith('\n') ? content : `${content}\n`;
  return `${trimmed}${line}\n`;
}

(async () => {
  console.log('\n🔐 关键环境变量交互式配置\n');

  for (const q of questions) {
    await askOne(q);
  }

  let out = raw;
  for (const q of questions) {
    out = upsertEnv(out, q.key, envMap[q.key]);
  }

  fs.writeFileSync(envPath, out, 'utf8');
  rl.close();

  console.log('\n✅ .env 已更新，继续启动服务...\n');
})().catch((err) => {
  console.error('❌ 配置失败:', err.message);
  rl.close();
  process.exit(1);
});
