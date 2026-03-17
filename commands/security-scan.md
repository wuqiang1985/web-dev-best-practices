---
description: 安全扫描当前代码，检测 OWASP Top 10 漏洞、密钥泄露、依赖漏洞。
---

# /security-scan 命令

调用 **security-reviewer** agent 对项目进行安全扫描。

## 扫描范围

| 类别 | 检测项 |
|------|--------|
| 密钥泄露 | 硬编码 API keys、passwords、tokens |
| 注入攻击 | SQL 注入、NoSQL 注入、命令注入 |
| XSS | DOM-based、Stored、Reflected |
| CSRF | State-changing 端点保护 |
| 认证 | JWT 验证、权限检查、会话管理 |
| 依赖 | npm audit、已知 CVE |
| 配置 | CORS、CSP、HTTPS、安全 headers |

## 使用方式

```
/security-scan              # 扫描整个项目
/security-scan src/api      # 扫描指定目录
```

## 输出

安全报告按严重级别排序：
- 🔴 CRITICAL — 立即修复
- 🟠 HIGH — 合并前修复
- 🟡 MEDIUM — 建议修复
- 🔵 LOW — 可选加固

## 发现 CRITICAL 问题时

1. 停止当前开发
2. 修复安全漏洞
3. 轮换可能泄露的密钥
4. 审查类似代码
