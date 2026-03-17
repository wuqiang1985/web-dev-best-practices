# Git 工作流规范

> 团队 Git 协作规范，包含 commit 格式、分支策略和 PR 流程。

## Commit 消息格式

```
<type>: <description>

<optional body>
```

### Type 类型

| Type | 含义 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat: add user registration` |
| `fix` | Bug 修复 | `fix: resolve login redirect loop` |
| `refactor` | 重构（不改变行为） | `refactor: extract validation utils` |
| `docs` | 文档 | `docs: update API endpoint docs` |
| `test` | 测试 | `test: add unit tests for auth service` |
| `chore` | 构建/工具 | `chore: upgrade vite to v6` |
| `perf` | 性能优化 | `perf: memoize expensive computation` |
| `ci` | CI/CD 变更 | `ci: add PostgreSQL service to CI` |

### 消息规则

- **description**: 使用祈使语气（"add" 而非 "added"）
- **首字母小写**，不以句号结尾
- **body**: 说明 Why 而非 What
- **Breaking changes**: 以 `BREAKING CHANGE:` 开头

## 分支策略

```
main          ← 生产分支（受保护）
├── develop   ← 开发分支
├── feature/  ← 功能分支（从 develop 创建）
├── hotfix/   ← 紧急修复（从 main 创建）
└── release/  ← 发布准备（从 develop 创建）
```

### 分支命名

- `feature/user-registration`
- `fix/login-redirect-loop`
- `hotfix/critical-auth-bypass`
- `release/v2.1.0`

## Pull Request 流程

### PR 标题

- 简洁（<70 字符）
- 使用 commit type 前缀: `feat: add user registration`

### PR 描述模板

```markdown
## Summary
- 添加了用户注册功能
- 包含邮箱验证和密码强度检查

## Changes
- 新增 `UserRegistration` 组件
- 新增 `/api/auth/register` 端点
- 新增注册相关数据库迁移

## Test Plan
- [ ] 手动测试注册流程
- [ ] 单元测试通过
- [ ] E2E 测试通过

## Screenshots (if applicable)
```

### 审查要求

- 至少 **1 人 approve** 才可合并
- CI 检查全部通过
- 无 CRITICAL 安全问题
- 合并方式: **Squash Merge**（保持 main 历史干净）

## 禁止操作

- ❌ 直接推送到 `main` / `develop`
- ❌ `git push --force` 到共享分支
- ❌ 提交含有 secrets 的文件（.env, credentials）
- ❌ 跳过 CI 检查（`--no-verify`）
