# 外部贸易团队多Agent系统 - 使用文档

## 📋 项目概述

这是一个基于 **OpenClaw + MiniMax** 的外贸多Agent团队自动化系统。系统包含6个专业化AI Agent，协同处理外贸业务的各个环节。

### 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenClaw Gateway                         │
│                      (Port 18789)                           │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│   PostgreSQL  │    │     Redis     │    │    PgAdmin   │
│   (Port 5432) │    │  (Port 6379)  │    │  (Port 5050) │
└───────────────┘    └───────────────┘    └───────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Agent Workers                            │
├──────────┬──────────┬──────────┬──────────┬────────┬────────┤
│Coordintor│HR_Trainer│Sales Lead│Supply Ld│Ops Lead│Finance │
└──────────┴──────────┴──────────┴──────────┴────────┴────────┘
```

### Agent职责

| Agent | 职责 | 核心功能 |
|-------|------|----------|
| **Coordinator** | 跨部门协调 | 任务路由、进度追踪、汇报汇总 |
| **HR Trainer** | 人事管理 | Agent配置、招聘流程、审批管理 |
| **Sales Lead** | 销售管理 | 询盘处理、报价生成、客户管理 |
| **Supply Lead** | 供应链 | 库存管理、采购订单、物流跟踪 |
| **Ops Lead** | 运营管理 | 生产排程、质检管理、问题上报 |
| **Finance Lead** | 财务管理 | 发票管理、收款跟进、成本分析 |

---

## 🚀 快速开始

### 1. 环境要求

- Docker Desktop (Mac/ Linux)
- 4GB+ RAM
- MiniMax API Key

### 2. 初始化

```bash
cd external_trade_team

# 赋予脚本执行权限
chmod +x scripts/*.sh

# 初始化环境
./scripts/setup_minimax.sh
```

### 3. 配置环境变量

```bash
# 复制配置模板
cp .env.example .env

# 编辑配置
nano .env
```

必须配置：
```env
DB_PASSWORD=your_secure_password
MINIMAX_API_KEY=sk-your-minimax-key
MINIMAX_MODEL_GENERAL=minimax-m2.1
MINIMAX_MODEL_REASONING=minimax-reasoning

# Telegram (可选)
TELEGRAM_BOT_TOKEN_COORDINATOR=xxx
TELEGRAM_CHAT_ID_MGMT_HQ=xxx
```

### 4. 启动服务

```bash
# 方式1: 使用Makefile
make start

# 方式2: 直接运行脚本
./scripts/start.sh
```

### 5. 验证服务

```bash
# 检查状态
make health

# 或运行测试
make test
```

---

## 📖 日常使用

### 使用Makefile命令

```bash
make help          # 查看所有命令
make start         # 启动所有服务
make stop          # 停止服务
make ps            # 查看服务状态
make logs          # 查看日志
make health        # 健康检查
make backup        # 备份数据

# 测试
make test-minimax  # 测试MiniMax API
make test-hr       # 测试HR流程
make test-e2e      # 端到端测试
```

---

## 👥 Agent管理 (HR Trainer)

### 招聘新Agent

在 #mgmt_hq 群发送：

```
你: /hire 日语售后

HR: 确认细节
  1. 名称：JP_AfterSales？
  2. 权限：能否改价格？
  3. 绑定群组？

你: 名称JP_AfterSales，价格不行，sales_team群

HR: 生成提案卡片
🧾 [创建] 提案 - JP_AfterSales
职责: ...
权限: can_change_price: false
绑定: #sales_team
请确认：
1️⃣ 职责是否准确？
2️⃣ /approve 或 /reject

你: /approve JP_AfterSales_draft

HR: ✅ 已创建
```

### 支持的指令

| 指令 | 说明 |
|------|------|
| `/hire <需求>` | 招聘新Agent |
| `/reassign <Agent> <配置>` | 重新分配 |
| `/deprecate <Agent>` | 停用Agent |
| `/list` | 列出所有Agent |
| `/status <Agent>` | 查看状态 |

---

## 💼 业务工作流

### 销售流程 (Sales Lead)

```javascript
// 1. 解析询盘
const inquiry = await parseInquiry(
  "客户ABC询1000件产品，预算$10k，急需",
  "email",
  { customerEmail: "customer@abc.com" }
);

// 2. 生成报价
const quote = await generateQuote(inquiry, {
  margin: 0.15,
  incoterms: "FOB"
});

// 3. 发送报价
await sendQuoteEmail(quote, "customer@abc.com");
```

### 采购流程 (Supply Lead)

```javascript
// 1. 检查库存
const inventory = await checkInventory("widget", 1000);

// 2. 如果库存不足，生成采购订单
const po = await generatePO({
  supplierId: "sup-001",
  items: [{ product: "widget", quantity: 1000, unitPrice: 5 }]
});

// 3. 发送PO给供应商
await sendPOToSupplier(po, "supplier@vendor.com");
```

### 运营流程 (Ops Lead)

```javascript
// 1. 安排生产
const production = await scheduleProduction({
  product: "widget",
  quantity: 1000,
  priority: "normal"
});

// 2. 生成质检清单
const checklist = await generateQCChecklist(
  production.id,
  "widget",
  1000
);

// 3. 问题上报
await issueReport({
  productionId: production.id,
  issueType: "quality",
  description: "发现外观缺陷",
  severity: "high"
});
```

### 财务流程 (Finance Lead)

```javascript
// 1. 开票
const invoice = await generateInvoice({
  customerId: "cust-001",
  orderId: "ORD-123",
  items: [{ description: "产品A", quantity: 100, unitPrice: 50 }]
});

// 2. 发送发票
await sendInvoice(invoice, "customer@abc.com");

// 3. 付款提醒
await paymentReminder(invoice.invoice_number);

// 4. 成本分析
await costAnalysis("ORD-123");
```

### 协调流程 (Coordinator)

```javascript
// 1. 路由任务
const result = routeTaskToLead("客户询1000件产品");
// 结果: { recommended_lead: "sales_lead", confidence: 0.8 }

// 2. 生成每日汇总
const summary = await generateDailySummary();

// 3. 格式化为Markdown
const report = formatSummaryAsMarkdown(summary);

// 4. 发送到管理群
await sendToGroup(CHAT_ID_MGMT_HQ, report);
```

---

## 🔧 定时任务

### 每日汇总

Coordinator 每天 19:00 自动生成汇总报告，发送到 #mgmt_hq 群。

### 配置 cron

```bash
# 在 OpenClaw 中配置
openclaw cron add --schedule "0 19 * * *" \
  --payload "Coordinator: 生成每日汇总" \
  --channel telegram
```

---

## 🛠️ 开发指南

### 项目结构

```
external_trade_team/
├── docker-compose.yml     # 服务编排
├── init.sql             # 数据库初始化
├── Makefile             # 便捷命令
├── scripts/             # 运维脚本
│   ├── setup_minimax.sh
│   ├── start.sh
│   ├── backup.sh
│   ├── health_check.sh
│   ├── test_minimax.sh
│   ├── test_hr_flow.sh
│   └── e2e_test.sh
├── src/                  # 核心模块
│   ├── agent_factory/    # Agent工厂
│   ├── audit/            # 审计模块
│   ├── telegram/          # 消息模块
│   ├── coordinator/       # 协调模块
│   ├── sales/            # 销售模块
│   ├── supply/           # 供应链模块
│   ├── ops/              # 运营模块
│   └── finance/          # 财务模块
├── agents/               # Agent配置
│   ├── coordinator/
│   ├── hr_trainer/
│   ├── sales_lead/
│   ├── supply_lead/
│   ├── ops_lead/
│   └── finance_lead/
└── configs/              # 配置文件
```

### 添加新工具

1. 在对应模块目录创建 `*.js` 文件
2. 导出函数
3. 在 Agent 的 `config.json` 中添加工具引用

### 数据库操作

```bash
# 连接数据库
docker exec -it openclaw_postgres psql -U openclaw -d openclaw_trade

# 查询Agent
SELECT * FROM agents;

# 查询审计日志
SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 10;

# 查询配置变更
SELECT * FROM config_change_log ORDER BY timestamp DESC;
```

---

## ⚠️ 注意事项

1. **安全**: 生产环境请使用强密码，设置 `groupPolicy` 为 `allowlist`
2. **备份**: 定期运行 `make backup`
3. **监控**: 检查 `make health` 确保服务健康
4. **日志**: 使用 `make logs` 实时查看日志

---

## ❓ 常见问题

**Q: 如何添加新的Agent?**
A: 通过 HR_Trainer 的提案+审批流程，或手动在 agents/ 目录创建。

**Q: 如何查看审计日志?**
A: 通过 PgAdmin (localhost:5050) 或连接数据库查询 audit_log 表。

**Q: MiniMax API 测试失败怎么办?**
A: 检查 .env 中的 API Key 是否正确，网络是否可达。

**Q: 如何扩展功能?**
A: 在 src/ 目录添加新模块，更新对应 Agent 的 config.json。

---

## 📞 支持

如有问题，请查看：
-  logs/ 目录下的日志文件
-  docker-compose ps 检查服务状态
-  make health 进行健康检查
