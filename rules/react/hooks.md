# React 自动化 Hooks

> Claude Code 自动化钩子配置，针对 React/TypeScript 项目的即时反馈。

## 概述

这些 hooks 在 Claude Code 编辑文件后自动触发，提供即时的代码质量反馈。
对应配置位于 `hooks/hooks.json`。

## 编辑后自动格式化

**触发时机**: Edit/Write 操作完成后
**作用**: 自动格式化 .ts/.tsx/.js/.jsx/.css/.json 文件

推荐格式化工具优先级：
1. **Biome**（推荐）— 更快、零配置
2. **Prettier** — 生态成熟、兼容性好

```json
// biome.json
{
  "formatter": {
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "semicolons": "always",
      "quoteStyle": "single",
      "trailingCommas": "all"
    }
  }
}
```

## 编辑后 ESLint 检查

**触发时机**: Edit/Write .ts/.tsx/.js/.jsx 文件后
**作用**: 自动运行 ESLint 检查 React 规则

### 推荐 ESLint 规则

```javascript
// eslint.config.js
export default [
  {
    plugins: {
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': 'error',
      'no-console': 'warn',
    },
  },
];
```

## 编辑后 TypeScript 类型检查

**触发时机**: Edit/Write .ts/.tsx 文件后
**作用**: 运行 `tsc --noEmit` 检查类型错误

类型错误会作为警告输出，不阻塞编辑流程。

## git push 前审查提醒

**触发时机**: Bash 执行 `git push` 前
**作用**: 提醒开发者先运行 `/review` 进行代码审查

## 团队项目配置

### 推荐 package.json scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest",
    "test:coverage": "vitest --coverage",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "format": "biome format --write src/",
    "typecheck": "tsc --noEmit",
    "e2e": "playwright test",
    "prepare": "husky"
  }
}
```

### lint-staged 配置

```json
// .lintstagedrc.json
{
  "*.{ts,tsx}": ["eslint --fix", "biome format --write"],
  "*.{json,md}": ["biome format --write"]
}
```
