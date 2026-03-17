#!/usr/bin/env node
// post-edit-typecheck.js
// 编辑 TypeScript 文件后运行类型检查（不阻塞）

const { execSync } = require('child_process');
const path = require('path');

const TS_EXTS = new Set(['.ts', '.tsx']);

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
  if (!TS_EXTS.has(ext)) {
    process.exit(0);
  }

  try {
    execSync('npx tsc --noEmit --pretty', {
      stdio: 'pipe',
      timeout: 30000,
    });
  } catch (error) {
    // 类型错误作为警告输出
    if (error.stdout) {
      process.stderr.write('⚠️ TypeScript 类型错误:\n');
      process.stderr.write(error.stdout);
    }
  }

  // 始终成功退出（不阻塞编辑）
  process.exit(0);
}

main().catch(() => process.exit(0));
