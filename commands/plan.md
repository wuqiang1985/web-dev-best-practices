---
description: 分析需求、评估风险、创建分步实现计划。确认前不写代码。
---

# /plan 命令

调用 **planner** agent 创建全面的实现计划。

## 流程

1. **Restate Requirements** — 用清晰的语言重述需求
2. **Architecture Review** — 审查现有代码结构，识别受影响组件
3. **Create Step Plan** — 创建分阶段、分步骤的实现计划
4. **Identify Risks** — 评估风险和缓解措施
5. **WAIT for Confirmation** — **必须**等待用户确认后才能写代码

## 使用方式

```
/plan 添加用户注册功能，包含邮箱验证
/plan 重构订单模块，提取公共组件
/plan 优化首页加载速度
```

## 关联命令

计划确认后：
- `/tdd` — 用 TDD 方式实现
- `/review` — 实现后代码审查
- `/security-scan` — 安全扫描
