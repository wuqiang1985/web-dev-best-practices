#!/usr/bin/env node
// post-edit-format.js
// 编辑文件后自动格式化（优先 Biome，fallback Prettier）

const { execSync } = require('child_process');
const path = require('path');

const FORMATTABLE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.css', '.scss', '.json', '.html', '.md',
]);

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let context;
  try {
    context = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  const filePath =
    context?.tool_input?.file_path ||
    context?.tool_input?.filePath ||
    context?.tool_result?.file_path;

  if (!filePath) {
    process.exit(0);
  }

  const ext = path.extname(filePath).toLowerCase();
  if (!FORMATTABLE_EXTS.has(ext)) {
    process.exit(0);
  }

  // 尝试 Biome
  try {
    execSync(`npx biome format --write "${filePath}"`, {
      stdio: 'pipe',
      timeout: 10000,
    });
    process.exit(0);
  } catch {
    // Biome 不可用，尝试 Prettier
  }

  // Fallback: Prettier
  try {
    execSync(`npx prettier --write "${filePath}"`, {
      stdio: 'pipe',
      timeout: 10000,
    });
    process.exit(0);
  } catch {
    // 都不可用，静默退出
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
