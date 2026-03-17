# Claude Code 插件组件指南

Claude Code 插件由 6 种组件构成，各司其职、协同工作。本文档说明每种组件的作用、工作机制、最佳实践，以及它们之间的配合关系。

---

## 组件总览

| 组件 | 一句话定位 | 触发方式 | 用户可见 |
|------|-----------|---------|---------|
| **Rules** | 编码规范 — "应该做什么" | 会话开始时 / 文件匹配时自动加载 | ❌ 静默生效 |
| **Skills** | 知识库 — "具体怎么做" | Claude 根据对话上下文自动激活 | ❌ 静默生效 |
| **Agents** | 专业代理 — "谁来做" | Claude 通过 Agent tool 派遣 | ❌ 内部调度 |
| **Commands** | 快捷入口 — "用户主动触发" | 用户输入 `/命令名` | ✅ 出现在 `/` 补全列表 |
| **Hooks** | 自动化钩子 — "事件驱动" | 文件编辑、命令执行等事件触发 | ❌ 静默执行 |
| **MCP** | 外部连接 — "扩展能力边界" | Claude 需要外部数据时调用 | ❌ 按需调用 |

---

## 1. Rules（规则）

### 作用

定义编码标准和约束，告诉 Claude **"应该做什么、不该做什么"**。相当于团队的编码规范文档，Claude 会在生成代码时自动遵守。

### 加载机制

Rules 通过 YAML frontmatter 中的字段决定何时加载：

| 模式 | frontmatter | 何时生效 | 适用场景 |
|------|------------|---------|---------|
| **始终生效** | `alwaysApply: true` | 每次会话都加载 | 通用编码风格、安全规范 |
| **文件匹配** | `globs: ["**/*.tsx"]` | 操作匹配文件时加载 | React 组件规范、SQL 规范 |
| **按需引用** | `description: "..."` | Claude 判断相关时加载 | 特定场景的指导 |

### 文件格式

```markdown
---
alwaysApply: true
---

# 编码风格

## 命名约定
- 组件使用 PascalCase
- 函数使用 camelCase
...
```

### 存放位置

```
~/.claude/rules/        # 用户级（所有项目生效）
.claude/rules/          # 项目级（仅当前项目）
```

> ⚠️ 插件系统不会自动分发 Rules 到上述目录，需通过 configure skill 或 install.sh 手动安装。

### 最佳实践

- **分层架构**：`common/`（通用）→ `react/`、`database/`（技术栈特定），特定规则 extends 通用规则
- **粒度适中**：每个文件聚焦一个领域（如编码风格、安全、测试），避免一个文件塞所有规则
- **可操作**：规则要具体到可执行，避免空泛的原则性描述
- **`alwaysApply` 要克制**：只有真正通用的规则才设为 `alwaysApply: true`，否则用 `globs` 限定范围，减少上下文消耗

### 常见陷阱

- Rules 内容过多会占用上下文窗口，影响 Claude 的推理能力
- `alwaysApply: true` 的规则每次对话都会加载，即使与当前任务无关

---

## 2. Skills（技能）

### 作用

提供**深度参考资料和代码模板**，告诉 Claude "具体怎么做"。相当于团队的知识库 / Cookbook，包含可直接复用的代码示例和模式。

### 与 Rules 的区别

| | Rules | Skills |
|---|---|---|
| 定位 | 约束和标准 | 知识和模板 |
| 内容 | "应该用函数组件，不用 class 组件" | "这是 Compound Components 的完整实现代码" |
| 长度 | 简短、精炼 | 详细、包含大量代码示例 |
| 加载 | 每次会话 / 文件匹配时自动加载 | 按需激活，不会始终占用上下文 |

### 激活机制

Claude 根据对话上下文**自动判断**是否激活某个 skill：

1. 用户说"帮我写一个 Redis 缓存"
2. Claude 识别到与 `redis-patterns` skill 相关
3. 自动加载 `redis-patterns/SKILL.md` 中的知识
4. 基于里面的模式和示例生成代码

### 文件格式

每个 skill 是一个**目录**，包含 `SKILL.md`：

```
skills/
├── react-patterns/
│   └── SKILL.md
├── redis-patterns/
│   └── SKILL.md
```

```markdown
---
name: react-patterns
description: React 组件组合、Hooks、状态管理、性能优化深度参考
origin: web-dev-best-practices
---

# React Patterns

## When to Activate
- 编写 React 组件时
- 讨论状态管理方案时
...

## Compound Components
（详细代码示例）
```

### 最佳实践

- **每个 skill 聚焦一个主题**：`react-patterns` 和 `react-testing` 分开，而不是合成一个巨大的 `react` skill
- **包含 "When to Activate" 章节**：帮助 Claude 准确判断何时激活
- **代码示例为主**：skill 的价值在于可直接复用的代码，不是空泛的描述
- **控制大小**：单个 SKILL.md 建议不超过 2000 行，太大会消耗过多上下文

### 常见陷阱

- Skill 文件过大导致激活后上下文不够用
- 没有 "When to Activate" 描述，Claude 可能在不相关的场景误激活
- 与 rules 内容重复（skill 写怎么做，rule 写要不要做）

---

## 3. Agents（代理）

### 作用

**专业化的子代理**，拥有独立的上下文窗口和工具权限。相当于团队中的专业角色（代码审查员、安全专家、DBA），由 Claude 按需派遣。

### 调用机制

```
用户请求 → Claude 主会话 → Agent tool → 子代理独立执行 → 返回结果
```

Agent 不是用户直接调用的，而是 Claude（或 Command）通过 `Agent tool` 自动派遣：

```markdown
<!-- command 中的调用示例 -->
使用 **web-dev:code-reviewer** agent 执行代码审查
```

### 文件格式

```markdown
---
name: code-reviewer
description: 代码审查专家，检查质量、安全、可维护性
tools:
  - Read
  - Grep
  - Glob
  - Bash
model: sonnet
---

# 系统提示词

你是一个代码审查专家...

## 审查流程
1. 读取 git diff
2. 按严重级别分类问题
...
```

### frontmatter 字段说明

| 字段 | 作用 | 示例 |
|------|------|------|
| `name` | 代理标识 | `code-reviewer` |
| `description` | 描述，帮助 Claude 判断何时派遣 | `代码审查专家` |
| `tools` | 限制可用工具，最小权限原则 | `["Read", "Grep", "Glob"]` |
| `model` | 指定模型 | `sonnet`（日常）、`opus`（复杂推理） |

### 最佳实践

- **最小权限**：`tools` 只给必要的工具，只读任务不给 `Write`/`Edit`
- **模型选择**：日常审查用 `sonnet`（快、省），架构决策用 `opus`（深度推理）
- **系统提示词要具体**：明确输出格式、审查维度、严重级别定义
- **单一职责**：每个 agent 专注一个领域（代码审查、安全、数据库），不要做全能代理

### 注册方式

在 `plugin.json` 中**必须列出具体文件路径**（不支持目录路径）：

```json
{
  "agents": [
    "./agents/code-reviewer.md",
    "./agents/planner.md"
  ]
}
```

### 常见陷阱

- `agents` 用目录路径（`"./agents/"`）会导致验证失败
- 给 agent 太多工具，增加安全风险和不可控行为
- 系统提示词太模糊，agent 输出质量不稳定

---

## 4. Commands（命令）

### 作用

**用户主动触发的入口**，是用户与插件交互的唯一可见界面。相当于 CLI 命令，出现在 `/` 补全列表中。

### 与 Skills/Agents 的关系

Commands 通常是 **Skills 和 Agents 的调度器**：

```
用户输入 /web-dev:review
  → Command 读取 review.md 中的指令
    → 调用 web-dev:code-reviewer agent 执行审查
      → Agent 参考 rules 中的编码规范
        → 输出审查报告
```

### 文件格式

```markdown
---
description: 对当前变更进行代码审查，检查质量、安全、可维护性。
---

# Code Review

使用 **web-dev:code-reviewer** agent 对当前代码变更进行审查。

## 使用方式
- `/web-dev:review` — 审查所有未提交变更
- `/web-dev:review src/components/` — 审查指定目录
```

### 注册方式

在 `plugin.json` 中可以用**目录路径**（与 agents 不同）：

```json
{
  "commands": ["./commands/"]
}
```

### 最佳实践

- **命令即入口**：command 本身不包含复杂逻辑，而是调度 agent 或引用 skill
- **描述要清晰**：frontmatter 的 `description` 会展示在补全列表中，帮用户理解命令用途
- **命名简短**：`review`、`plan`、`tdd`，而不是 `run-code-review-analysis`
- **提供使用示例**：在 command 内容中说明不同调用方式

### 常见陷阱

- command 内容写得太长，把本该放在 skill 或 agent 中的知识塞进来
- 多个 command 之间功能重叠

---

## 5. Hooks（钩子）

### 作用

**事件驱动的自动化脚本**，在特定事件（文件编辑、命令执行等）前后自动触发。相当于 Git hooks 或 IDE 的保存后自动格式化。

### 事件类型

| 事件 | 触发时机 | 典型用途 |
|------|---------|---------|
| `PreToolUse` | 工具调用**之前** | 参数校验、安全拦截 |
| `PostToolUse` | 工具调用**之后** | 自动格式化、lint 检查、类型检查 |

### 配置格式（hooks.json）

```json
[
  {
    "matcher": "Edit|Write",
    "hooks": [
      {
        "type": "PostToolUse",
        "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/post-edit-format.js"
      }
    ]
  },
  {
    "matcher": "Bash",
    "hooks": [
      {
        "type": "PreToolUse",
        "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/pre-push-review.js"
      }
    ]
  }
]
```

- **`matcher`**：匹配工具名（`Edit`、`Write`、`Bash` 等），支持 `|` 分隔多个
- **`type`**：`PreToolUse` 或 `PostToolUse`
- **`command`**：要执行的脚本，`${CLAUDE_PLUGIN_ROOT}` 会替换为插件根目录
- **`alwaysRun`**：设为 `true` 时无论上下文如何都执行

### 脚本接收上下文

Hook 脚本通过 **stdin** 接收 JSON 格式的上下文信息：

```javascript
// post-edit-format.js
const input = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
const filePath = input.tool_input?.file_path;

// 对编辑的文件执行格式化
if (filePath) {
  execSync(`npx biome format --write "${filePath}"`);
}
```

### 最佳实践

- **非阻塞**：hook 脚本出错应静默退出（`process.exit(0)`），不要阻断 Claude 工作流
- **轻量快速**：hook 每次操作都会触发，耗时操作会严重影响体验
- **不要在 plugin.json 中声明 hooks**：Claude Code v2.1+ 自动加载 `hooks/hooks.json`，显式声明会报 "duplicate hooks" 错误
- **使用 `${CLAUDE_PLUGIN_ROOT}`**：确保脚本路径在任何安装位置都正确

### 常见陷阱

- 在 `plugin.json` 中添加 `"hooks"` 字段导致重复加载错误
- Hook 脚本报错导致 Claude 流程中断
- Hook 执行耗时过长（如全量 TypeScript 编译），应该只检查变更文件

---

## 6. MCP（模型上下文协议）

### 作用

**连接外部服务和工具**，扩展 Claude 的能力边界。通过标准化协议让 Claude 访问 GitHub、数据库、文件系统、搜索引擎等外部资源。

### 配置格式（mcp-servers.json）

```json
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "YOUR_TOKEN"
    }
  },
  "sequential-thinking": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
  }
}
```

### 服务器类型

| 类型 | 配置方式 | 示例 |
|------|---------|------|
| **本地命令** | `command` + `args` | GitHub MCP、Filesystem MCP |
| **HTTP 远程** | `type: "http"` + `url` | Vercel MCP、第三方 API |

### 最佳实践

- **按需启用**：不要一次性启用太多 MCP 服务器（建议不超过 10 个），每个都会消耗上下文
- **API Key 安全**：配置模板用占位符，不提交真实 API Key 到仓库
- **仅作模板提供**：插件的 `mcp/mcp-servers.json` 是参考模板，用户需手动复制到 `~/.claude/` 并填入自己的 Key

### 常见陷阱

- 把真实 API Key 提交到 Git 仓库
- 启用太多 MCP 服务器导致上下文窗口紧张
- MCP 服务器启动失败但没有错误提示，Claude 静默降级

---

## 组件协作流程

### 典型流程：用户执行 `/web-dev:review`

```
┌─────────────────────────────────────────────────────┐
│  用户输入: /web-dev:review                           │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│  Command (review.md)                                │
│  读取命令内容，指示调用 code-reviewer agent          │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│  Agent (code-reviewer.md)                           │
│  以独立子代理运行，拥有 Read/Grep/Glob/Bash 工具     │
│  按系统提示词执行代码审查                             │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │ Rules (自动生效)                              │    │
│  │ 审查时参考 coding-style、security 等规范      │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │ Skills (按需激活)                             │    │
│  │ 如发现 React 代码，激活 react-patterns skill  │    │
│  └─────────────────────────────────────────────┘    │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│  审查报告输出                                        │
│  Agent 发现问题 → Claude 建议修复 → 用户确认修改      │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│  Hooks (自动触发)                                    │
│  文件被修改后:                                       │
│  1. post-edit-format.js → 自动格式化                 │
│  2. post-edit-lint.js → ESLint 检查                  │
│  3. post-edit-typecheck.js → TypeScript 类型检查      │
└─────────────────────────────────────────────────────┘
```

### 协作关系图

```
┌──────────────────────────────────────────────────────────┐
│                      用户交互层                           │
│                                                          │
│   /web-dev:plan  /web-dev:review  /web-dev:tdd  ...     │
│       │               │               │                  │
│       └───────────────┼───────────────┘                  │
│                       │                                  │
│                  Commands                                │
│                  (调度入口)                                │
└───────────────────────┬──────────────────────────────────┘
                        │ 调用
                        ▼
┌──────────────────────────────────────────────────────────┐
│                      执行层                               │
│                                                          │
│   ┌──────────┐   ┌──────────┐   ┌──────────┐           │
│   │ planner  │   │ reviewer │   │ tdd-guide│           │
│   │ (Opus)   │   │ (Sonnet) │   │ (Sonnet) │   ...     │
│   └────┬─────┘   └────┬─────┘   └────┬─────┘           │
│        │              │              │                   │
│        └──────────────┼──────────────┘                   │
│                       │                                  │
│                  Agents                                  │
│                  (专业子代理)                              │
└───────────────────────┬──────────────────────────────────┘
                        │ 参考
                        ▼
┌──────────────────────────────────────────────────────────┐
│                      知识层                               │
│                                                          │
│   Rules (编码规范)           Skills (知识库)              │
│   ┌──────────────────┐      ┌──────────────────┐        │
│   │ coding-style     │      │ react-patterns   │        │
│   │ security         │      │ postgres-patterns│        │
│   │ testing          │      │ redis-patterns   │        │
│   │ performance      │      │ api-design       │        │
│   └──────────────────┘      └──────────────────┘        │
│   始终/按文件模式加载         按对话上下文激活             │
└──────────────────────────────────────────────────────────┘
                        │
┌──────────────────────────────────────────────────────────┐
│                      自动化层                             │
│                                                          │
│   Hooks (事件驱动)           MCP (外部连接)               │
│   ┌──────────────────┐      ┌──────────────────┐        │
│   │ PostToolUse:     │      │ GitHub API       │        │
│   │   格式化          │      │ Filesystem       │        │
│   │   Lint 检查       │      │ Memory           │        │
│   │   类型检查        │      │ Sequential Think │        │
│   │ PreToolUse:      │      │ Context7         │        │
│   │   安全拦截        │      │                  │        │
│   └──────────────────┘      └──────────────────┘        │
│   文件变更后自动执行          按需连接外部服务              │
└──────────────────────────────────────────────────────────┘
```

---

## 设计原则

### 1. 关注点分离

每种组件有明确的职责边界：

- **Rules** 只定义标准，不包含代码示例
- **Skills** 只提供知识，不定义约束
- **Agents** 只执行任务，不承载知识
- **Commands** 只做调度，不包含业务逻辑
- **Hooks** 只做自动化，不影响业务逻辑
- **MCP** 只做连接，不包含业务逻辑

### 2. 上下文窗口意识

所有组件都会消耗上下文窗口。优先级排序：

1. **Rules**（`alwaysApply`）— 每次必加载，要精简
2. **当前任务相关的 Skill** — 按需加载
3. **Agent 的系统提示词** — 独立窗口，不挤主会话
4. **MCP 返回的数据** — 按需获取

### 3. 渐进式加载

```
会话开始 → 加载 alwaysApply rules
         → 用户操作文件 → 按 globs 加载匹配 rules
         → 对话涉及 React → 激活 react-patterns skill
         → 用户调用 /review → 启动 code-reviewer agent
         → agent 修改文件 → 触发 hooks 自动格式化
```

### 4. 团队协作友好

| 共享级别 | 方式 | 适用场景 |
|---------|------|---------|
| 全团队 | 插件发布到 GitHub，`/plugin install` | 统一的编码规范和工具链 |
| 项目级 | `.claude/` 目录提交到 Git | 项目特定的配置 |
| 个人 | `~/.claude/` 目录 | 个人偏好和自定义 |
