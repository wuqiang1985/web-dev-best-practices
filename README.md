# web-dev-best-practices

团队共享的 Claude Code 插件，沉淀 Web 开发最佳实践（React 前端 + 数据库中间件），实现开发规范统一、代码质量自动保障、知识复用。

插件名称：**`web-dev`**，所有命令和技能通过 `web-dev:` 前缀调用，与其他插件（如 ECC）互不冲突。

## 安装

### 方式一：插件命令安装（推荐）

在 Claude Code 会话中执行：

```bash
# 第一步：注册 marketplace（仅首次需要）
/plugin marketplace add wuqiang1985/web-dev-best-practices

# 第二步：安装插件
/plugin install web-dev@web-dev-best-practices
```

安装后 agents、commands、skills、hooks **自动生效**。

> ⚠️ Rules 不会自动生效（Claude Code 插件系统限制），需要执行第二步。

**补装 Rules：**

```
/web-dev:configure
```

交互式向导引导你：
1. 选择安装级别（用户级 / 项目级）
2. 选择要安装的 Rules（通用 / React / 数据库 / 全部）
3. 自动验证安装结果

### 方式二：安装脚本（一键全量安装）

```bash
git clone https://github.com/wuqiang1985/web-dev-best-practices.git
cd web-dev-best-practices

# 用户级安装（所有项目生效）
chmod +x install.sh
./install.sh --user

# 或项目级安装（仅当前项目生效，可提交到 Git 团队共享）
./install.sh --project
```

### 方式三：手动按需复制

```bash
git clone https://github.com/wuqiang1985/web-dev-best-practices.git

# 只装 Rules
cp -r rules/common ~/.claude/rules/common
cp -r rules/react ~/.claude/rules/react

# 只装某个 Skill
cp -r skills/react-patterns ~/.claude/skills/react-patterns

# 只装 Agents 和 Commands
cp -r agents ~/.claude/agents
cp -r commands ~/.claude/commands
```

### 安装方式对比

| | 方式一：插件命令 | 方式二：安装脚本 | 方式三：手动复制 |
|---|---|---|---|
| 安装方式 | `marketplace add` + `plugin install` | `./install.sh` | 手动 `cp` |
| Agents/Commands/Skills/Hooks | 自动生效 | 复制到目标目录 | 按需复制 |
| Rules | 需通过 `/web-dev:configure` 补装 | 自动复制 | 按需复制 |
| 按需选择 | ✅ 交互式选择 Rules | ❌ 全量安装 | ✅ 完全自定义 |
| 与其他插件冲突 | ❌ 不冲突（`web-dev:` 前缀隔离） | ⚠️ 可能覆盖同名文件 | ⚠️ 可能覆盖同名文件 |
| 适合场景 | 日常使用 | 快速全量部署 | 只需要部分组件 |

---

## 插件结构

```
web-dev-best-practices/
├── .claude-plugin/           # 插件清单（Claude Code 插件系统）
│   └── plugin.json           # name: "web-dev" → 命令前缀 web-dev:
├── CLAUDE.md                 # 插件入口说明
├── rules/                    # 编码规范（分层架构）
│   ├── common/               # 通用规范（6 个文件）
│   ├── react/                # React + TypeScript 规范（4 个文件）
│   └── database/             # 数据库规范（4 个文件）
├── skills/                   # 深度知识技能库（8 个技能）
│   ├── configure/            # 交互式 Rules 安装向导
│   ├── react-patterns/       # React 组件设计、hooks、状态管理
│   ├── react-testing/        # Vitest + RTL + Playwright
│   ├── api-design/           # RESTful API 设计模式
│   ├── postgres-patterns/    # PostgreSQL 查询优化、索引
│   ├── redis-patterns/       # Redis 缓存策略、数据结构
│   ├── docker-patterns/      # Docker 容器化
│   └── deployment-patterns/  # CI/CD、蓝绿部署、回滚
├── agents/                   # 专业 AI 代理（6 个）
├── commands/                 # 快捷命令（5 个 + configure）
├── hooks/                    # 自动化钩子
│   ├── hooks.json            # 钩子配置
│   └── scripts/              # 钩子脚本（4 个）
├── mcp/                      # MCP 服务器配置模板
├── install.sh                # 一键安装脚本
└── README.md
```

---

## Commands 快捷命令

通过 `/install` 安装后，所有命令带 `web-dev:` 前缀，与 ECC 等其他插件互不冲突：

| 命令 | 说明 | 示例 |
|------|------|------|
| `/web-dev:plan` | 功能规划 | `/web-dev:plan 实现用户认证模块` |
| `/web-dev:review` | 代码审查 | `/web-dev:review` |
| `/web-dev:tdd` | 测试驱动开发 | `/web-dev:tdd 实现购物车功能` |
| `/web-dev:security-scan` | 安全扫描 | `/web-dev:security-scan` |
| `/web-dev:db-review` | 数据库审查 | `/web-dev:db-review` |
| `/web-dev:configure` | 补装 Rules | `/web-dev:configure` |

> 通过方式二/三安装时，命令没有前缀，直接使用 `/plan`、`/review` 等。

---

## Rules 编码规范

Rules 采用分层架构，`common` 层定义通用原则，`react` 和 `database` 层按技术栈扩展。

### 通用规范 (`rules/common/`)

| 文件 | 内容 |
|------|------|
| `coding-style.md` | 命名约定、文件组织（200-400 行最佳）、不可变性、错误处理 |
| `git-workflow.md` | Commit 格式、分支策略、PR 流程、Squash Merge |
| `api-design.md` | RESTful 资源命名、状态码、统一响应格式、游标分页 |
| `security.md` | OWASP Top 10、密钥管理、参数化查询、XSS/CSRF 防御 |
| `testing.md` | TDD 流程（RED→GREEN→REFACTOR）、80%+ 覆盖率 |
| `performance.md` | 代码分割、懒加载、虚拟列表、缓存策略、N+1 预防 |

### React 规范 (`rules/react/`)

| 文件 | 内容 |
|------|------|
| `coding-style.md` | 函数组件、项目结构、命名规范、Props 设计、TypeScript 严格模式 |
| `testing.md` | Vitest + RTL + Playwright、查询优先级、MSW Mock |
| `patterns.md` | 状态管理（Zustand/TanStack Query）、数据获取、错误边界 |
| `hooks.md` | 自动格式化（Biome/Prettier）、ESLint、TypeScript 检查 |

### 数据库规范 (`rules/database/`)

| 文件 | 内容 |
|------|------|
| `coding-style.md` | 表命名（snake_case 复数）、数据类型选择、必备字段 |
| `security.md` | 参数化查询、最小权限、RLS、审计日志 |
| `patterns.md` | 版本化迁移、连接池、事务管理、Repository 模式 |
| `performance.md` | 索引类型、EXPLAIN ANALYZE、分区、缓存层级 |

---

## Skills 技能库

Skills 提供深度参考资料，在需要时按需激活。通过插件安装时带 `web-dev:` 前缀。

| 技能 | 激活场景 |
|------|---------|
| `web-dev:react-patterns` | 编写 React 组件、自定义 hooks、状态管理、性能优化 |
| `web-dev:react-testing` | 编写组件测试、E2E 测试、配置 Vitest/Playwright |
| `web-dev:api-design` | 设计 REST API、JWT 认证、分页、错误处理 |
| `web-dev:postgres-patterns` | 编写 SQL 查询、设计索引、优化性能、配置 RLS |
| `web-dev:redis-patterns` | 缓存策略、分布式锁、消息队列、会话管理 |
| `web-dev:docker-patterns` | Dockerfile 多阶段构建、Docker Compose、安全加固 |
| `web-dev:deployment-patterns` | GitHub Actions CI/CD、蓝绿部署、回滚策略 |
| `web-dev:configure` | 交互式 Rules 安装向导 |

---

## Agents 专业代理

可通过 Agent tool 或快捷命令自动调用。通过插件安装时带 `web-dev:` 前缀。

| 代理 | 模型 | 职责 |
|------|------|------|
| `web-dev:code-reviewer` | Sonnet | 通用代码审查（安全、质量、可维护性） |
| `web-dev:react-reviewer` | Sonnet | React 专项（组件设计、hooks、性能、a11y） |
| `web-dev:security-reviewer` | Sonnet | 安全审查（OWASP、密钥、注入） |
| `web-dev:database-reviewer` | Sonnet | 数据库审查（SQL 质量、索引、N+1） |
| `web-dev:planner` | Opus | 功能规划（需求分析、架构设计、任务拆解） |
| `web-dev:tdd-guide` | Sonnet | TDD 引导（测试优先、覆盖率保障） |

---

## Hooks 自动化钩子

编辑文件后自动触发，无需手动操作：

| 钩子 | 触发时机 | 功能 |
|------|---------|------|
| `post-edit-format` | 编辑/写入文件后 | 自动格式化（Biome → Prettier 降级） |
| `post-edit-lint` | 编辑/写入文件后 | ESLint 检查 |
| `post-edit-typecheck` | 编辑/写入文件后 | TypeScript 类型检查 |
| `pre-push-review` | 执行 git push 前 | 提醒运行 `/web-dev:review` |

---

## MCP 服务器

`mcp/mcp-servers.json` 提供推荐的 MCP 服务器配置模板：

- **GitHub** — PR、Issue、代码搜索
- **Filesystem** — 本地文件读写
- **Memory** — 会话间知识持久化
- **Sequential Thinking** — 复杂推理辅助
- **Context7** — 库文档即时查询

> ⚠️ 使用前需将模板中的占位符替换为实际 API Key。

---

## 自定义扩展

### 调整已有组件

- **启用/禁用 Rules**：删除或注释不需要的 rule 文件
- **调整 Hooks**：编辑 `hooks/hooks.json` 中的 `matcher` 和 `command` 字段

### 新增组件

| 组件 | 新增方式 | 格式要求 |
|------|---------|---------|
| Rule | 在 `rules/` 对应目录下添加 `.md` 文件 | YAML frontmatter（`alwaysApply`、`globs`、`description`） |
| Skill | 在 `skills/` 下新建目录，添加 `SKILL.md` | YAML frontmatter（`name`、`description`、`origin`） |
| Agent | 在 `agents/` 下添加 `.md` 文件 | YAML frontmatter（`name`、`description`、`tools`、`model`） |
| Command | 在 `commands/` 下添加 `.md` 文件 | YAML frontmatter（`description`） |

> 新增 Agent 后需同步更新 `.claude-plugin/plugin.json` 中的 `agents` 数组（必须列出具体文件路径）。Commands 和 Skills 使用目录路径，无需逐一声明。

---

## 技术栈覆盖

| 领域 | 技术 |
|------|------|
| 前端 | React + TypeScript + Vite/Next.js |
| 测试 | Vitest + React Testing Library + Playwright |
| 后端 API | Express / Fastify / Next.js API Routes |
| 数据库 | PostgreSQL / MySQL |
| 缓存 | Redis (ioredis) |
| 容器化 | Docker + Docker Compose |
| CI/CD | GitHub Actions |
| 代码质量 | Biome / ESLint + Prettier |
| 表单 | React Hook Form + Zod |
| 状态管理 | Zustand + TanStack Query |

---

## 插件管理

| 操作 | 命令 |
|------|------|
| 注册 marketplace | `/plugin marketplace add wuqiang1985/web-dev-best-practices`（仅首次） |
| 安装插件 | `/plugin install web-dev@web-dev-best-practices` |
| 补装 Rules | `/web-dev:configure` |
| 临时停用 | `/plugin disable web-dev` |
| 恢复启用 | `/plugin enable web-dev` |
| 卸载插件 | `/plugin uninstall web-dev` |
| 清理 Rules | 手动 `rm -rf ~/.claude/rules/{common,react,database}` |

> 卸载插件会清理插件本体（缓存目录 + 配置），但通过 `/web-dev:configure` 复制到 `~/.claude/rules/` 的 Rules 不会被自动清理，需手动删除。

---

## 贡献指南

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feat/your-feature`
3. 遵循上述文件格式要求添加内容
4. 提交 PR，描述变更内容和适用场景

---

## 许可证

MIT
