---
name: configure
description: web-dev-best-practices Rules 安装向导 — 引导用户选择安装级别和 Rules 组件，验证安装结果，可选优化。
origin: web-dev-best-practices
---

# Configure web-dev-best-practices

交互式 Rules 安装向导。通过 `/install` 安装插件后，agents、commands、skills、hooks 已自动生效，**唯独 Rules 需要手动安装**到 `~/.claude/rules/` 或 `.claude/rules/` 才能生效。此向导引导你完成这一步。

## When to Activate

- 用户说 "configure"、"安装 rules"、"setup web-dev"、"install rules" 等
- 用户通过 `/install` 安装插件后，需要补装 Rules
- 用户想选择性安装部分 Rules
- 用户想验证或修复已有的 Rules 安装

## 前置条件

此 Skill 需要先被 Claude Code 加载。两种方式：
1. **通过插件安装**: `/install web-dev-best-practices` — 插件会自动加载此 Skill
2. **手动引导**: 复制此文件到 `~/.claude/skills/configure/SKILL.md`，然后说 "configure"

## 为什么需要这个向导？

通过 `/install` 安装插件后：

| 组件 | 状态 | 原因 |
|------|------|------|
| ✅ Agents | 自动生效 | 插件系统自动加载 |
| ✅ Commands | 自动生效 | 插件系统自动加载 |
| ✅ Skills | 自动生效 | 插件系统自动加载 |
| ✅ Hooks | 自动生效 | Claude Code v2.1+ 按约定自动加载 hooks/hooks.json |
| ❌ **Rules** | **不会生效** | 插件系统不支持自动分发 Rules，必须复制到 ~/.claude/rules/ 或 .claude/rules/ |

此向导就是为了解决 Rules 的安装问题。

---

## Step 0: 定位插件源码

首先确定 Rules 源文件的位置。按以下优先级查找：

```bash
# 优先级 1: 已安装的插件缓存目录
PLUGIN_ROOT=$(find ~/.claude-internal/plugins/cache -type d -name "web-dev-best-practices" 2>/dev/null | head -1)

# 优先级 2: 当前目录（开发模式）
if [ -z "$PLUGIN_ROOT" ] && [ -f "./CLAUDE.md" ] && [ -d "./rules" ]; then
  PLUGIN_ROOT="$(pwd)"
fi

# 优先级 3: 从 Git 克隆
if [ -z "$PLUGIN_ROOT" ]; then
  rm -rf /tmp/web-dev-best-practices
  git clone <repo-url> /tmp/web-dev-best-practices
  PLUGIN_ROOT=/tmp/web-dev-best-practices
fi
```

如果以上方式都失败，使用 `AskUserQuestion` 请用户提供本地路径。

---

## Step 1: 选择安装级别

使用 `AskUserQuestion` 询问安装位置：

```
Question: "将 Rules 安装到哪里？"
Options:
  - "用户级 (~/.claude/rules/) (推荐)" — "对所有 Claude Code 项目生效"
  - "项目级 (.claude/rules/)" — "仅对当前项目生效，可提交到 Git 团队共享"
```

根据选择设置目标目录：
- 用户级: `TARGET=~/.claude`
- 项目级: `TARGET=.claude`（相对于当前项目根目录）

创建必要目录：
```bash
mkdir -p $TARGET/rules
```

---

## Step 2: 选择并安装 Rules

使用 `AskUserQuestion`（`multiSelect: true`）：

```
Question: "要安装哪些编码规范？"
Options:
  - "通用规范 (推荐)" — "语言无关的编码风格、Git 工作流、API 设计、安全、测试、性能（6 个文件）"
  - "React 规范" — "React + TypeScript 编码风格、测试、设计模式、自动化 hooks（4 个文件）"
  - "数据库规范" — "SQL 编码规范、安全、设计模式、性能优化（4 个文件）"
  - "全部安装" — "安装所有 14 个规范文件"
```

### 执行安装

```bash
# 通用规范
mkdir -p $TARGET/rules/common
cp -r $PLUGIN_ROOT/rules/common/* $TARGET/rules/common/

# React 规范
mkdir -p $TARGET/rules/react
cp -r $PLUGIN_ROOT/rules/react/* $TARGET/rules/react/

# 数据库规范
mkdir -p $TARGET/rules/database
cp -r $PLUGIN_ROOT/rules/database/* $TARGET/rules/database/
```

### 依赖提醒

如果用户选了 React 或数据库规范，但**没有**选通用规范，提醒：
> "React / 数据库规范引用了通用规范中的原则。建议同时安装通用规范，否则部分引用可能不完整。是否一并安装？"

### 规范文件清单

**通用规范 (`rules/common/`) — 6 个文件**

| 文件 | 内容 |
|------|------|
| `coding-style.md` | 命名约定、文件组织（200-400 行）、不可变性、错误处理、输入验证 |
| `git-workflow.md` | Commit 格式、分支策略（main/develop/feature/hotfix）、PR 流程 |
| `api-design.md` | RESTful 命名、状态码、统一响应信封、游标分页、限流 |
| `security.md` | OWASP Top 10、密钥管理、参数化查询、XSS/CSRF 防御 |
| `testing.md` | TDD 流程（RED→GREEN→REFACTOR）、80%+ 覆盖率、Mock 原则 |
| `performance.md` | 代码分割、懒加载、虚拟列表、Core Web Vitals、N+1 预防 |

**React 规范 (`rules/react/`) — 4 个文件**

| 文件 | 内容 |
|------|------|
| `coding-style.md` | 函数组件、项目结构、命名规范、Props 设计、TypeScript 严格模式 |
| `testing.md` | Vitest + RTL + Playwright、查询优先级、MSW Mock |
| `patterns.md` | 状态管理（Zustand/TanStack Query）、数据获取、错误边界 |
| `hooks.md` | 自动格式化（Biome/Prettier）、ESLint、TypeScript 检查 |

**数据库规范 (`rules/database/`) — 4 个文件**

| 文件 | 内容 |
|------|------|
| `coding-style.md` | 表命名（snake_case 复数）、数据类型、必备字段、CHECK 约束 |
| `security.md` | 参数化查询、最小权限、RLS、审计日志、备份策略 |
| `patterns.md` | 版本化迁移、连接池、事务管理、Repository 模式、N+1 预防 |
| `performance.md` | 索引类型（B-tree/GIN/GiST/BRIN）、EXPLAIN ANALYZE、分区 |

---

## Step 3: 安装后验证

### 3a: 验证文件存在

```bash
echo "=== 已安装的 Rules ==="
ls -la $TARGET/rules/common/ 2>/dev/null || echo "  (未安装通用规范)"
ls -la $TARGET/rules/react/ 2>/dev/null || echo "  (未安装 React 规范)"
ls -la $TARGET/rules/database/ 2>/dev/null || echo "  (未安装数据库规范)"
```

### 3b: 检查交叉引用

```bash
# 检查 rules 之间的引用
grep -rn "../common/" $TARGET/rules/react/ $TARGET/rules/database/ 2>/dev/null
```

如果 React 或数据库规范引用了 `../common/` 但通用规范未安装，报告问题。

### 3c: 输出验证结果

对每个发现的问题报告：
1. **文件**：包含问题引用的文件
2. **行号**：具体行
3. **问题**：描述（如 "引用 ../common/coding-style.md 但通用规范未安装"）
4. **建议**：修复方法

---

## Step 4: 针对项目优化（可选）

使用 `AskUserQuestion`：

```
Question: "是否针对你的项目优化已安装的 Rules？"
Options:
  - "优化" — "调整覆盖率目标、格式化工具偏好、Git 规范等"
  - "跳过" — "保持原样"
```

### 优化内容
1. 询问项目技术栈（如果尚未确定）
2. 调整测试覆盖率目标（默认 80%）
3. 调整格式化工具偏好（Biome vs Prettier）
4. 添加项目特定的 Git 分支命名规范

**关键**：只修改安装目标 (`$TARGET/`) 中的文件，**绝不修改**插件源码 (`$PLUGIN_ROOT/`)。

---

## Step 5: 清理并输出总结

如果从 Git 克隆了源码，清理临时目录：
```bash
rm -rf /tmp/web-dev-best-practices
```

输出安装摘要：

```
## web-dev-best-practices Rules 安装完成

### 安装位置
- 级别: [用户级 / 项目级]
- 路径: [目标路径]

### 已安装 Rules（[数量] 个文件）
- ✅ 通用规范（6 个文件）
- ✅ React 规范（4 个文件）
- ✅ 数据库规范（4 个文件）

### 验证结果
- [数量] 个问题，[数量] 个已修复

### 完整安装确认
- ✅ Agents — 已通过 /install 自动加载
- ✅ Commands — 已通过 /install 自动加载
- ✅ Skills — 已通过 /install 自动加载
- ✅ Hooks — 已通过 /install 自动加载
- ✅ Rules — 刚刚安装完成

### 下一步
1. 启动新的 Claude Code 会话
2. Rules 会自动加载
3. 试试: /plan, /review, /tdd, /security-scan, /db-review
```

---

## 故障排查

### "Rules 没有生效"
- 确认文件在 `~/.claude/rules/` 或 `.claude/rules/` 下
- 检查 YAML frontmatter 中的 `alwaysApply` 和 `globs` 配置
- 重启 Claude Code 会话

### "Hooks 没有触发"
- 通过 `/install` 安装时，hooks 自动加载，不需要额外配置
- 检查项目中是否安装了对应工具（biome、eslint、tsc）

### "想重新选择安装的 Rules"
- 再次说 "configure" 即可重新运行此向导
- 已有文件会被覆盖
