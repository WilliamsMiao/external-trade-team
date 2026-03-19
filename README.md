# 外贸团队多 Agent 系统

这是一个面向外贸业务的多 Agent 自动化系统，提供选品、获客、询盘处理、供应链协同和财务流转的一体化运行环境。

## 你可以做什么
- 通过 `make start` 一键启动整套服务
- 用 `make status` / `make watch` 查看运行态
- 用 `make report` / `make briefing` 看团队执行结果
- 用 `make dashboard` 看管理者驾驶舱
- 用 `make ask AGENT=sales MSG='...'` 和单个 Agent 交互

## Agent 角色
- `coordinator`: 任务协调与路由
- `hr`: 团队配置与训练
- `sales`: 询盘、报价、客户跟进
- `acquisition`: 互联网获客与线索提纯
- `selection`: 互联网选品与质量门禁
- `supply`: 供应链与库存核查
- `ops`: 生产排程与交付协调
- `finance`: 开票、收款与对账

## 快速开始
```bash
chmod +x scripts/*.sh
./scripts/env_wizard.js
make start
make health
```

## 常用命令
```bash
make status
make watch
make report
make briefing
make dashboard
make demo
```

## 安全提醒
- `.env` 里包含敏感配置，不要提交到 Git
- 过程文档会自动忽略，避免把运行记录带进版本库

## 说明
- 详细使用方式请看 [USAGE.md](USAGE.md)
- 如需了解各命令，可运行 `make help`
