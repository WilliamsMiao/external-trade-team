# 外部贸易团队多Agent系统

基于 OpenClaw + MiniMax 的外贸团队自动化系统。

## 项目简介

多个专业化 Agent 协同处理外贸业务：
- **Coordinator**: 跨部门任务协调
- **Sales Lead**: 销售与客户管理
- **Supply Lead**: 供应链管理
- **Ops Lead**: 运营管理
- **Finance Lead**: 财务管理
- **HR Trainer**: 团队培训与知识库

## 快速启动

```bash
# 1. 初始化
chmod +x scripts/*.sh
./scripts/setup_minimax.sh

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填入真实配置 (特别是 DB_PASSWORD 和 MINIMAX_API_KEY)

# 3. 启动服务
./scripts/start.sh

# 4. 检查状态
./scripts/health_check.sh

# 5. 测试 MiniMax API
./scripts/test_minimax.sh

# 6. 测试 HR 流程
./scripts/test_hr_flow.sh
```

## 服务架构

| 服务 | 端口 | 说明 |
|------|------|------|
| PostgreSQL | 5432 | 业务数据库 |
| Redis | 6379 | 缓存/队列 |
| OpenClaw Gateway | 18789 | Agent运行时 |
| Agent Workers | - | 6个Agent容器 |
| PgAdmin | 5050 | 数据库管理 |

## 开发阶段

- [x] 阶段0: 项目骨架
- [x] 阶段1: MiniMax API集成 + Agent Factory
- [x] 阶段2: HR_Trainer 完整工作流 ✅ 当前
- [ ] 阶段3: 业务Agent基础实现
- [ ] 阶段4: 外部系统集成

## 阶段2: HR_Trainer 工作流

### 已实现

1. **HR_Trainer System Prompt** (`agents/hr_trainer/prompts/system.md`)
   - 完整的招聘/变更流程
   - 提案卡片格式标准
   - 审批规则

2. **工具增强** (`agents/hr_trainer/config.json`)
   - parse_intent - 解析指令
   - generate_proposal_card - 生成提案
   - agent_factory_* - Agent生命周期管理
   - log_config_change - 变更日志
   - send_to_group - 群发消息

3. **Agent Factory 完整实现** (`src/agent_factory/`)
   - createAgent - 创建新Agent
   - updateAgent - 更新Agent配置
   - deprecateAgent - 停用Agent
   - reactivateAgent - 重新激活
   - listAgents / getAgent - 查询

4. **审计模块** (`src/audit/`)
   - logAction - 业务日志
   - logConfigChange - 配置变更日志
   - queryAuditLog / queryConfigChangeLog - 查询
   - getAuditStats - 统计

5. **Telegram工具** (`src/telegram/`)
   - sendToGroup - 发送到群组
   - sendToUser - 发送给用户
   - sendWithButtons - 带按钮消息

### HR_Trainer 工作流程

```
用户: /hire 日本售后

HR: 确认细节
  1. 名称：JP_AfterSales？
  2. 权限：能否改价格？
  3. 绑定群组？

用户: 名称JP_AfterSales，价格不行，sales_team群

HR: 生成提案卡片
🧾 [创建] 提案 - JP_AfterSales
职责: ...
权限: can_change_price: false
绑定: #sales_team
请确认：
1️⃣ 职责是否准确？
2️⃣ 权限需要调整吗？
3️⃣ /approve 或 /reject

用户: /approve JP_AfterSales_draft

HR: ✅ 执行变更
  - 调用 createAgent
  - 记录 config_change_log
  - 在 #sales_team 发自我介绍
```

### 使用示例

```javascript
// 创建新Agent
const { createAgent } = require('./src/agent_factory');

const spec = {
  name: "jp_aftersales",
  type: "specialist",
  department: "sales",
  description: "日语售后Agent",
  responsibilities: ["处理日语客户咨询", "跟进售后问题"],
  tools: ["log_audit"],
  approvedBy: "hr_trainer"
};

const result = await createAgent(spec);
```

```javascript
// 发送Telegram消息
const { sendToGroup } = require('./src/telegram');

await sendToGroup(
  process.env.TELEGRAM_CHAT_ID_SALES_TEAM,
  "👋 你好！我是新Agent"
);
```

```javascript
// 记录配置变更
const { logConfigChange } = require('./src/audit');

await logConfigChange(
  agentName = "jp_aftersales",
  changeType = "create",
  beforeState = null,
  afterState = {...},
  approvedBy = "hr_trainer",
  reason = "新增日语售后"
);
```

## 目录结构

```
external_trade_team/
├── docker-compose.yml
├── .env.example
├── init.sql
├── README.md
├── scripts/
│   ├── setup_minimax.sh
│   ├── start.sh
│   ├── backup.sh
│   ├── health_check.sh
│   ├── test_minimax.sh
│   └── test_hr_flow.sh
├── src/
│   ├── agent_factory/
│   │   ├── index.js          # 完整实现
│   │   ├── schema.json
│   │   └── templates/
│   ├── audit/
│   │   └── index.js          # 完整实现
│   └── telegram/
│       └── index.js          # 消息发送
├── agents/
│   ├── coordinator/
│   ├── hr_trainer/
│   │   ├── config.json
│   │   ├── identity.md
│   │   └── prompts/
│   │       └── system.md     # System Prompt
│   ├── sales_lead/
│   ├── supply_lead/
│   ├── ops_lead/
│   └── finance_lead/
└── configs/
```

## 后续步骤

1. 进入阶段3: 实现 Sales Lead 等业务Agent
2. 添加外部系统集成 (CRM, 支付, 物流)

## 常见问题

**Q: 如何招聘新Agent?**
A: 在 #mgmt_hq 群发送 `/hire <需求>`，HR_Trainer 会引导你完成提案和审批流程。

**Q: 如何查看配置变更历史?**
A: 查询 `config_change_log` 表，或使用 `queryConfigChangeLog()` 函数。

**Q: Agent创建失败怎么办?**
A: 检查错误信息，常见原因：名称重复、参数不合法、权限不足。
