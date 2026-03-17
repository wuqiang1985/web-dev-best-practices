---
description: 启动测试驱动开发流程。先写测试，再写实现，确保 80%+ 覆盖率。
---

# /tdd 命令

调用 **tdd-guide** agent 引导测试驱动开发。

## TDD 流程

```
1. RED    — 先写失败的测试 ❌
2. GREEN  — 写最少的代码让测试通过 ✅
3. REFACTOR — 优化代码，测试保持绿色 ♻️
```

## 使用方式

```
/tdd 实现用户注册服务
/tdd 修复登录超时 bug
/tdd 重构订单价格计算
```

## 覆盖率要求

- 总体 >= 80%
- 包含：Statements, Branches, Functions, Lines

## 测试工具

| 类型 | 工具 |
|------|------|
| 单元/组件测试 | Vitest + React Testing Library |
| API Mock | MSW (Mock Service Worker) |
| E2E 测试 | Playwright |
| 覆盖率 | Vitest Coverage (v8) |
