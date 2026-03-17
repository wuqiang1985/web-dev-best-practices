# Plugin Manifest 注意事项

基于 ECC 踩坑经验总结的 Claude Code 插件清单（plugin.json）约束。

## 关键规则

### 1. `version` 必填
缺少 `version` 字段会导致安装失败。

### 2. 字段必须是数组
`agents`、`commands`、`skills` 字段**必须是数组**，即使只有一项。

```json
// ❌ 错误
{ "agents": "./agents/" }

// ✅ 正确
{ "agents": ["./agents/planner.md"] }
```

### 3. agents 必须指定具体文件路径
目录路径对 agents **不生效**，必须逐一列出每个文件。

```json
// ❌ 错误
{ "agents": ["./agents/"] }

// ✅ 正确
{
  "agents": [
    "./agents/code-reviewer.md",
    "./agents/planner.md"
  ]
}
```

### 4. 不要声明 hooks
Claude Code v2.1+ **自动加载** `hooks/hooks.json`。在 plugin.json 中声明会导致：
```
Duplicate hooks file detected
```

### 5. commands 和 skills 可以用目录路径
用数组包裹目录路径即可：
```json
{
  "commands": ["./commands/"],
  "skills": ["./skills/"]
}
```

## 验证

修改 plugin.json 后，运行：
```bash
claude plugin validate .claude-plugin/plugin.json
```
