---
description: 对当前变更进行代码审查，检查质量、安全、可维护性。
---

# /review 命令

调用 **code-reviewer** agent 对当前代码变更进行全面审查。

## 审查范围

- **Security (CRITICAL)**: 硬编码密钥、SQL 注入、XSS、CSRF
- **Code Quality (HIGH)**: 大函数、深嵌套、缺少错误处理、mutation
- **React Patterns (HIGH)**: 依赖数组、重渲染、key 使用
- **Performance (MEDIUM)**: N+1 查询、大 bundle、缺少缓存
- **Best Practices (LOW)**: 命名、魔法数字、TODO

## 使用方式

```
/review                    # 审查所有未提交的变更
/review src/features/auth  # 审查指定目录
```

## 输出

格式化审查报告，按 CRITICAL → LOW 排序，包含：
- 问题位置（文件:行号）
- 问题描述
- 修复建议
- 总结表格和审批结论

## 审批标准

- **Approve**: 无 CRITICAL 或 HIGH
- **Warning**: 有 HIGH 但无 CRITICAL
- **Block**: 有 CRITICAL，必须修复
