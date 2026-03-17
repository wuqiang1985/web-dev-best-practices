# web-dev-best-practices

Web 开发最佳实践 Claude Code 插件。

## 插件概述

面向团队共享的 Web 开发最佳实践集合，覆盖 React + TypeScript 前端和数据库/中间件后端。
通过 Rules 规范编码标准、Skills 沉淀领域知识、Agents 自动化质量保障、Hooks 实现即时反馈。

## 技术栈

- **前端**: React + TypeScript + Vite / Next.js
- **数据库**: PostgreSQL / MySQL
- **缓存**: Redis
- **通用**: REST API 设计、Docker、CI/CD

## 可用命令

| 命令 | 用途 |
|------|------|
| `/plan` | 功能规划 — 分析需求、评估风险、生成分步计划 |
| `/review` | 代码审查 — 质量、安全、可维护性 |
| `/tdd` | 测试驱动开发 — 先写测试，再写实现 |
| `/security-scan` | 安全扫描 — OWASP Top 10、密钥泄露 |
| `/db-review` | 数据库审查 — SQL 质量、索引、N+1 |

## 可用 Agents

| Agent | 用途 | 模型 |
|-------|------|------|
| planner | 功能规划 | Opus |
| code-reviewer | 代码审查 | Sonnet |
| react-reviewer | React 专项审查 | Sonnet |
| security-reviewer | 安全审查 | Sonnet |
| database-reviewer | 数据库审查 | Sonnet |
| tdd-guide | TDD 引导 | Sonnet |

## 规范体系

Rules 采用分层架构：`common`（通用）→ `react` / `database`（领域特定）。
领域特定规则 extends 通用规则，冲突时领域特定优先。

## 自动化 Hooks

- 编辑后自动格式化（Biome / Prettier）
- 编辑后 ESLint 检查
- 编辑后 TypeScript 类型检查
- git push 前审查提醒
