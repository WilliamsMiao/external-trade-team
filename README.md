# 外部贸易团队多Agent系统

基于 OpenClaw + MiniMax 的外贸团队自动化系统。

## 项目简介

6个专业化AI Agent协同处理外贸业务：
- **Coordinator**: 跨部门任务协调
- **HR Trainer**: 人事管理、Agent配置
- **Sales Lead**: 销售询盘、报价、客户管理
- **Supply Lead**: 供应链、采购、库存
- **Ops Lead**: 生产排程、质检、物流
- **Finance Lead**: 发票、收款、成本分析

## 快速开始

```bash
# 1. 克隆项目
git clone https://github.com/WilliamsMiao/external-trade-team.git
cd external_trade_team

# 2. 初始化
chmod +x scripts/*.sh
./scripts/setup_minimax.sh

# 3. 配置
cp .env.example .env
# 编辑 .env 填入配置

# 4. 启动
make start
```

## 开发阶段

- [x] 阶段0: 项目骨架
- [x] 阶段1: MiniMax API集成 + Agent Factory
- [x] 阶段2: HR_Trainer 完整工作流
- [x] 阶段3: 业务Agent基础实现
- [x] 阶段4: 外部系统集成 ✅ 当前

## 技术栈

- **运行时**: OpenClaw
- **LLM**: MiniMax API
- **数据库**: PostgreSQL
- **缓存**: Redis
- **编排**: Docker Compose

## 文档

详细使用说明见 [USAGE.md](USAGE.md)

## License

MIT
