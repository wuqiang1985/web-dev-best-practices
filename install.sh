#!/bin/bash
# web-dev-best-practices 插件安装脚本
# 用法: ./install.sh [--user | --project]
#   --user     安装到用户目录 (~/.claude/)，全局生效
#   --project  安装到当前项目 (.claude/)，仅项目生效
#   默认: --user

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_MODE="${1:---user}"

# 目标目录
if [ "$INSTALL_MODE" = "--project" ]; then
  TARGET_DIR="$(pwd)/.claude"
  echo "📦 安装模式: 项目级别 ($(pwd)/.claude/)"
else
  TARGET_DIR="$HOME/.claude"
  echo "📦 安装模式: 用户级别 (~/.claude/)"
fi

echo "📂 源目录: $SCRIPT_DIR"
echo "📂 目标目录: $TARGET_DIR"
echo ""

# 创建目标目录
mkdir -p "$TARGET_DIR"

# === Rules ===
echo "📋 安装 Rules..."
mkdir -p "$TARGET_DIR/rules/common"
mkdir -p "$TARGET_DIR/rules/react"
mkdir -p "$TARGET_DIR/rules/database"
cp -r "$SCRIPT_DIR/rules/common/"* "$TARGET_DIR/rules/common/"
cp -r "$SCRIPT_DIR/rules/react/"* "$TARGET_DIR/rules/react/"
cp -r "$SCRIPT_DIR/rules/database/"* "$TARGET_DIR/rules/database/"
echo "   ✅ rules/common/ (6 个文件)"
echo "   ✅ rules/react/ (4 个文件)"
echo "   ✅ rules/database/ (4 个文件)"

# === Skills ===
echo "📚 安装 Skills..."
for skill_dir in "$SCRIPT_DIR/skills/"/*/; do
  skill_name=$(basename "$skill_dir")
  mkdir -p "$TARGET_DIR/skills/$skill_name"
  cp -r "$skill_dir"* "$TARGET_DIR/skills/$skill_name/"
done
echo "   ✅ skills/ ($(ls -d "$SCRIPT_DIR/skills/"*/ | wc -l | tr -d ' ') 个技能)"

# === Agents ===
echo "🤖 安装 Agents..."
mkdir -p "$TARGET_DIR/agents"
cp "$SCRIPT_DIR/agents/"*.md "$TARGET_DIR/agents/"
echo "   ✅ agents/ ($(ls "$SCRIPT_DIR/agents/"*.md | wc -l | tr -d ' ') 个代理)"

# === Commands ===
echo "⌨️  安装 Commands..."
mkdir -p "$TARGET_DIR/commands"
cp "$SCRIPT_DIR/commands/"*.md "$TARGET_DIR/commands/"
echo "   ✅ commands/ ($(ls "$SCRIPT_DIR/commands/"*.md | wc -l | tr -d ' ') 个命令)"

# === Hooks ===
echo "🪝 安装 Hooks..."
mkdir -p "$TARGET_DIR/hooks/scripts"
cp "$SCRIPT_DIR/hooks/hooks.json" "$TARGET_DIR/hooks/"
cp "$SCRIPT_DIR/hooks/scripts/"*.js "$TARGET_DIR/hooks/scripts/"
echo "   ✅ hooks/ (hooks.json + $(ls "$SCRIPT_DIR/hooks/scripts/"*.js | wc -l | tr -d ' ') 个脚本)"

# === MCP ===
echo "🔌 安装 MCP 配置模板..."
mkdir -p "$TARGET_DIR/mcp"
cp "$SCRIPT_DIR/mcp/mcp-servers.json" "$TARGET_DIR/mcp/"
echo "   ✅ mcp/mcp-servers.json (模板，需手动配置 API key)"

echo ""
echo "============================================"
echo "✅ web-dev-best-practices 安装完成！"
echo "============================================"
echo ""
echo "📌 下一步:"
echo "  1. 启动新的 Claude Code 会话"
echo "  2. Rules 会自动加载"
echo "  3. 尝试命令: /plan, /review, /tdd, /security-scan, /db-review"
echo ""
echo "⚙️  可选配置:"
echo "  - 编辑 $TARGET_DIR/mcp/mcp-servers.json 配置 MCP 服务器"
echo "  - 查看 $TARGET_DIR/hooks/hooks.json 自定义 hooks"
echo ""
