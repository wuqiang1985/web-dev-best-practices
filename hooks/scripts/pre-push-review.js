#!/usr/bin/env node
// pre-push-review.js
// git push 前提醒开发者先做代码审查

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

  const command = context?.tool_input?.command || '';

  // 检查是否是 git push 命令
  if (/\bgit\s+push\b/.test(command)) {
    process.stdout.write(
      '\n⚠️  即将执行 git push。\n' +
      '建议先运行 /review 进行代码审查，确保代码质量。\n' +
      '也可以运行 /security-scan 检查安全问题。\n\n'
    );
  }

  // 不阻塞操作
  process.exit(0);
}

main().catch(() => process.exit(0));
