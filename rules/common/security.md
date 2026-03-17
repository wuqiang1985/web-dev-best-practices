# 安全规范

> Web 开发安全基线，覆盖 OWASP Top 10 核心风险。

## 提交前安全检查清单（MANDATORY）

- [ ] 无硬编码密钥（API keys, passwords, tokens）
- [ ] 所有用户输入已验证
- [ ] SQL 查询使用参数化
- [ ] HTML 输出已转义（防 XSS）
- [ ] State-changing 端点有 CSRF 保护
- [ ] 认证/授权逻辑已验证
- [ ] 公开端点已配置 Rate Limiting
- [ ] 错误信息不泄漏内部细节

## 密钥管理

### 绝对禁止

```typescript
// ❌ NEVER: 硬编码密钥
const API_KEY = 'sk-abc123xyz';
const DB_PASSWORD = 'super_secret';

// ❌ NEVER: 提交 .env 文件
// .env 必须在 .gitignore 中
```

### 正确方式

```typescript
// ✅ GOOD: 使用环境变量
const apiKey = process.env.API_KEY;
if (!apiKey) {
  throw new Error('API_KEY environment variable is required');
}

// ✅ GOOD: 提供 .env.example（不含实际值）
// .env.example:
// API_KEY=your-api-key-here
// DATABASE_URL=postgresql://user:pass@localhost:5432/dbname
```

## 输入验证

```typescript
// ✅ 在所有系统边界验证
import { z } from 'zod';

const UserInputSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100).regex(/^[a-zA-Z\u4e00-\u9fa5\s]+$/),
  age: z.number().int().min(0).max(150),
});

// 永远不信任外部数据
function handleRequest(rawInput: unknown) {
  const input = UserInputSchema.parse(rawInput); // 验证 + 类型安全
  // 使用 input...
}
```

## SQL 注入防御

```typescript
// ❌ BAD: 字符串拼接
const query = `SELECT * FROM users WHERE email = '${email}'`;

// ✅ GOOD: 参数化查询
const query = 'SELECT * FROM users WHERE email = $1';
const result = await db.query(query, [email]);

// ✅ GOOD: ORM
const user = await prisma.user.findUnique({ where: { email } });
```

## XSS 防御

```typescript
// ❌ BAD: 直接插入用户 HTML
element.innerHTML = userInput;

// ✅ GOOD: React 默认转义
return <div>{userInput}</div>;

// ✅ GOOD: 需要 HTML 时使用 sanitizer
import DOMPurify from 'dompurify';
const clean = DOMPurify.sanitize(userHtml);
```

## CSRF 防护

- SPA: 使用 `SameSite=Strict` cookie + CSRF token
- API: 使用 Bearer token（不受 CSRF 影响）
- 表单: 每个表单包含 CSRF token

## 认证与授权

```typescript
// ✅ 每个受保护端点都要检查
async function handleRequest(req: Request) {
  // 1. 认证：验证身份
  const user = await authenticate(req);
  if (!user) return unauthorized();

  // 2. 授权：验证权限
  if (!user.hasPermission('admin:write')) {
    return forbidden();
  }

  // 3. 处理请求
  return processRequest(req, user);
}
```

## 安全 Headers

```typescript
// 推荐使用 helmet (Express) 或等价配置
{
  'Content-Security-Policy': "default-src 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '0',  // 现代浏览器用 CSP 替代
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
}
```

## 依赖安全

```bash
# 定期检查依赖漏洞
npm audit
npx better-npm-audit audit

# CI 中自动检查
# GitHub Dependabot / Snyk / Socket.dev
```

## 日志安全

```typescript
// ❌ BAD: 记录敏感信息
logger.info('User login', { password, token, creditCard });

// ✅ GOOD: 脱敏后记录
logger.info('User login', { userId: user.id, email: maskEmail(user.email) });
```

## 安全事件响应

发现安全问题时：
1. **立即停止** — 不继续开发
2. 使用 `/security-scan` 全面扫描
3. 修复 CRITICAL 问题
4. 轮换可能泄露的密钥
5. 审查整个代码库是否有类似问题
