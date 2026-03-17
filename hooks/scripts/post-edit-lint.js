#!/usr/bin/env node
// post-edit-lint.js
// 编辑文件后运行 ESLint 检查（不阻塞）

const { execSync } = require('child_process');
const path = require('path');

const LINTABLE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx']);

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
  if (!LINTABLE_EXTS.has(ext)) {
    process.exit(0);
  }

  try {
    execSync(`npx eslint --fix "${filePath}"`, {
      stdio: 'pipe',
      timeout: 15000,
    });
  } catch (error) {
    // 输出 lint 警告到 stderr（不阻塞）
    if (error.stderr) {
      process.stderr.write(error.stderr);
    }
    if (error.stdout) {
      process.stderr.write(error.stdout);
    }
  }

  // 始终成功退出（不阻塞编辑）
  process.exit(0);
}

main().catch(() => process.exit(0));
