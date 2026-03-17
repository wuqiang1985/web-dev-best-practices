---
name: api-design
description: RESTful API 设计深度参考，涵盖资源设计、HTTP 语义、统一信封模式、JWT 认证、分页、过滤排序、错误处理（RFC 7807）、版本控制、Rate Limiting、OpenAPI 文档、HATEOAS、GraphQL 对比。
origin: web-dev-best-practices
---

# RESTful API 设计

生产级 REST API 的完整设计深度参考。

## When to Activate

- 设计新的 API 端点和资源 URL 结构
- 实现认证方案（JWT、Session、API Key）
- 设计分页（cursor-based、offset-based）
- 实现过滤、排序、搜索 query 参数
- 设计错误处理格式（Problem Details RFC 7807）
- 实现 Rate Limiting（Token Bucket、Sliding Window）
- 编写 OpenAPI/Swagger 文档
- 选择 API 版本控制策略
- 评估 GraphQL vs REST

---

## 1. 资源设计与 URL 结构

### 命名规范

```
# ✅ GOOD: 复数名词，层级清晰
GET    /api/v1/users
GET    /api/v1/users/:id
POST   /api/v1/users
PUT    /api/v1/users/:id
PATCH  /api/v1/users/:id
DELETE /api/v1/users/:id

# ✅ GOOD: 嵌套资源（表示所属关系）
GET    /api/v1/users/:userId/orders
POST   /api/v1/users/:userId/orders
GET    /api/v1/users/:userId/orders/:orderId

# ✅ GOOD: 操作端点（无法用 CRUD 表达的业务操作）
POST   /api/v1/orders/:id/cancel
POST   /api/v1/users/:id/verify-email
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
POST   /api/v1/auth/refresh

# ❌ BAD: 动词作为资源名
GET    /api/v1/getUsers
POST   /api/v1/createUser
DELETE /api/v1/deleteUser/:id
```

### HTTP 方法语义与幂等性

| 方法 | 语义 | 幂等 | 安全 | 请求体 | 典型状态码 |
|------|------|------|------|--------|-----------|
| GET | 读取资源 | ✅ | ✅ | 无 | 200 |
| POST | 创建资源 | ❌ | ❌ | 有 | 201 |
| PUT | 全量替换 | ✅ | ❌ | 有 | 200 |
| PATCH | 部分更新 | ❌ | ❌ | 有 | 200 |
| DELETE | 删除资源 | ✅ | ❌ | 无 | 204 |
| HEAD | 获取头信息 | ✅ | ✅ | 无 | 200 |
| OPTIONS | 获取选项 | ✅ | ✅ | 无 | 204 |

---

## 2. 统一响应信封

### 类型定义

```typescript
// types/api.ts
interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: ApiError | null;
  meta: ApiMeta | null;
}

interface ApiError {
  code: string;            // 机器可读的错误码
  message: string;         // 人类可读的错误消息
  details?: FieldError[];  // 字段级错误详情
}

interface FieldError {
  field: string;
  message: string;
  code?: string;
}

interface ApiMeta {
  total?: number;
  page?: number;
  limit?: number;
  hasNext?: boolean;
  hasPrev?: boolean;
  nextCursor?: string;
  prevCursor?: string;
}
```

### 工具函数

```typescript
function ok<T>(data: T, meta?: ApiMeta): ApiResponse<T> {
  return { success: true, data, error: null, meta: meta ?? null };
}

function created<T>(data: T): ApiResponse<T> {
  return { success: true, data, error: null, meta: null };
}

function fail(code: string, message: string, details?: FieldError[]): ApiResponse<never> {
  return { success: false, data: null, error: { code, message, details }, meta: null };
}

// 响应示例
// 成功: { success: true, data: { id: "1", name: "Alice" }, error: null, meta: null }
// 列表: { success: true, data: [...], error: null, meta: { total: 100, hasNext: true, nextCursor: "abc" } }
// 错误: { success: false, data: null, error: { code: "VALIDATION_ERROR", message: "...", details: [...] }, meta: null }
```

---

## 3. 认证方案

### 3.1 JWT (JSON Web Token)

```typescript
import jwt from 'jsonwebtoken';

interface TokenPayload {
  sub: string;        // user id
  type: 'access' | 'refresh';
  roles: string[];
}

// ── 签发 ──────────────────────────────────────────────────
function generateTokens(user: User) {
  const accessToken = jwt.sign(
    { sub: user.id, type: 'access', roles: user.roles } satisfies TokenPayload,
    process.env.JWT_SECRET!,
    { expiresIn: '15m', issuer: 'myapp', audience: 'myapp-api' }
  );

  const refreshToken = jwt.sign(
    { sub: user.id, type: 'refresh', roles: user.roles } satisfies TokenPayload,
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: '7d', issuer: 'myapp' }
  );

  return { accessToken, refreshToken };
}

// ── 验证中间件 ────────────────────────────────────────────
async function authenticate(req: Request): Promise<User> {
  const header = req.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) {
    throw new AuthError('MISSING_TOKEN', 'Authorization header required');
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!, {
      issuer: 'myapp',
      audience: 'myapp-api',
    }) as TokenPayload;

    if (payload.type !== 'access') {
      throw new AuthError('INVALID_TOKEN_TYPE', 'Expected access token');
    }

    const user = await findUserById(payload.sub);
    if (!user) throw new AuthError('USER_NOT_FOUND', 'User not found');
    return user;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthError('TOKEN_EXPIRED', 'Token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthError('INVALID_TOKEN', 'Invalid token');
    }
    throw error;
  }
}
```

### 3.2 Refresh Token 流程

```typescript
// POST /api/auth/refresh
async function refreshTokenHandler(req: Request) {
  const { refreshToken } = await req.json();

  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as TokenPayload;

    if (payload.type !== 'refresh') {
      return fail('INVALID_TOKEN_TYPE', 'Expected refresh token');
    }

    // 检查 token 是否被撤销
    const isRevoked = await isTokenRevoked(refreshToken);
    if (isRevoked) return fail('TOKEN_REVOKED', 'Token has been revoked');

    const user = await findUserById(payload.sub);
    if (!user) return fail('USER_NOT_FOUND', 'User not found');

    // Token Rotation：签发新 token 对，使旧 refresh token 失效
    const tokens = generateTokens(user);
    await revokeRefreshToken(refreshToken);
    await storeRefreshToken(tokens.refreshToken, user.id);

    return ok(tokens);
  } catch {
    return fail('INVALID_TOKEN', 'Invalid refresh token');
  }
}
```

### 3.3 Session-Based 认证

```typescript
import session from 'express-session';
import RedisStore from 'connect-redis';
import { createClient } from 'redis';

const redisClient = createClient({ url: process.env.REDIS_URL });

app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 24h
  },
}));
```

### 3.4 API Key 认证

```typescript
async function apiKeyAuth(req: Request): Promise<ApiClient> {
  const apiKey = req.headers.get('X-API-Key');
  if (!apiKey) throw new AuthError('MISSING_API_KEY', 'X-API-Key header required');

  // 存储的是 hash，不是明文
  const hashedKey = hashApiKey(apiKey);
  const client = await findApiClientByKeyHash(hashedKey);

  if (!client) throw new AuthError('INVALID_API_KEY', 'Invalid API key');
  if (client.expiresAt && client.expiresAt < new Date()) {
    throw new AuthError('API_KEY_EXPIRED', 'API key has expired');
  }

  // 记录使用
  await updateApiKeyLastUsed(client.id);

  return client;
}
```

---

## 4. 分页实现

### 4.1 Cursor-Based 分页（推荐）

高性能，适合实时数据和大数据集：

```typescript
// GET /api/users?cursor=abc&limit=20
async function listUsers(req: Request) {
  const url = new URL(req.url);
  const cursor = url.searchParams.get('cursor');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20'), 100);

  let query = 'SELECT * FROM users WHERE deleted_at IS NULL';
  const params: unknown[] = [];

  if (cursor) {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    query += ` AND (created_at, id) < ($${params.length + 1}, $${params.length + 2})`;
    params.push(decoded.created_at, decoded.id);
  }

  query += ` ORDER BY created_at DESC, id DESC LIMIT $${params.length + 1}`;
  params.push(limit + 1); // 多取一条判断 hasNext

  const result = await pool.query(query, params);
  const hasNext = result.rows.length > limit;
  const items = result.rows.slice(0, limit);

  const nextCursor = hasNext
    ? Buffer.from(JSON.stringify({
        created_at: items.at(-1)!.created_at,
        id: items.at(-1)!.id,
      })).toString('base64url')
    : undefined;

  return ok(items, { hasNext, nextCursor, limit });
}
```

### 4.2 Offset-Based 分页

简单，适合管理后台和需要"跳转到第 N 页"的场景：

```typescript
// GET /api/users?page=2&limit=20
async function listUsersOffset(req: Request) {
  const url = new URL(req.url);
  const page = Math.max(parseInt(url.searchParams.get('page') ?? '1'), 1);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20'), 100);
  const offset = (page - 1) * limit;

  const [countResult, dataResult] = await Promise.all([
    pool.query('SELECT COUNT(*) FROM users WHERE deleted_at IS NULL'),
    pool.query(
      'SELECT * FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    ),
  ]);

  const total = parseInt(countResult.rows[0].count);

  return ok(dataResult.rows, {
    total,
    page,
    limit,
    hasNext: offset + limit < total,
    hasPrev: page > 1,
  });
}
```

---

## 5. 过滤、排序与搜索

```typescript
// GET /api/products?category=electronics&minPrice=100&sort=-price,name&fields=id,name,price&search=keyboard

interface ParsedQuery {
  filters: Record<string, unknown>;
  sort: Array<{ field: string; order: 'asc' | 'desc' }>;
  fields: string[] | null;
  search: string | null;
}

function parseQueryParams(url: URL): ParsedQuery {
  return {
    filters: {
      category: url.searchParams.get('category'),
      minPrice: url.searchParams.has('minPrice')
        ? parseFloat(url.searchParams.get('minPrice')!)
        : undefined,
      maxPrice: url.searchParams.has('maxPrice')
        ? parseFloat(url.searchParams.get('maxPrice')!)
        : undefined,
      status: url.searchParams.get('status'),
    },
    sort: parseSortParam(url.searchParams.get('sort')),
    fields: url.searchParams.get('fields')?.split(',') ?? null,
    search: url.searchParams.get('search'),
  };
}

function parseSortParam(sort: string | null): Array<{ field: string; order: 'asc' | 'desc' }> {
  if (!sort) return [{ field: 'created_at', order: 'desc' }];

  const ALLOWED_SORT_FIELDS = new Set(['name', 'price', 'created_at', 'updated_at']);

  return sort.split(',').flatMap(s => {
    const desc = s.startsWith('-');
    const field = desc ? s.slice(1) : s;

    // 白名单校验，防止 SQL 注入
    if (!ALLOWED_SORT_FIELDS.has(field)) return [];

    return [{ field, order: desc ? 'desc' as const : 'asc' as const }];
  });
}
```

---

## 6. 错误处理

### 6.1 自定义错误类层级

```typescript
class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public details?: FieldError[]
  ) {
    super(message);
    this.name = 'AppError';
  }
}

class ValidationError extends AppError {
  constructor(details: FieldError[]) {
    super('VALIDATION_ERROR', 'Request validation failed', 422, details);
  }
}

class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super('NOT_FOUND', `${resource} with id ${id} not found`, 404);
  }
}

class AuthError extends AppError {
  constructor(code: string, message: string) {
    super(code, message, 401);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super('FORBIDDEN', message, 403);
  }
}

class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message, 409);
  }
}

class RateLimitError extends AppError {
  constructor() {
    super('RATE_LIMIT_EXCEEDED', 'Too many requests, please try again later', 429);
  }
}
```

### 6.2 Problem Details (RFC 7807)

标准化的错误响应格式：

```typescript
interface ProblemDetail {
  type: string;        // URI 标识错误类型
  title: string;       // 简短描述
  status: number;      // HTTP 状态码
  detail: string;      // 详细描述
  instance: string;    // 请求的 URI
  errors?: FieldError[];
}

function toProblemDetail(error: AppError, requestUrl: string): ProblemDetail {
  return {
    type: `https://api.example.com/errors/${error.code.toLowerCase()}`,
    title: error.code,
    status: error.statusCode,
    detail: error.message,
    instance: requestUrl,
    errors: error.details,
  };
}
```

### 6.3 全局错误处理中间件

```typescript
// Express 示例
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json(
      fail(err.code, err.message, err.details)
    );
  }

  // Zod 验证错误
  if (err instanceof ZodError) {
    const details = err.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    return res.status(422).json(
      fail('VALIDATION_ERROR', 'Request validation failed', details)
    );
  }

  // 未预期的错误 — 不暴露内部细节
  console.error('Unexpected error:', err);
  return res.status(500).json(
    fail('INTERNAL_ERROR', 'An unexpected error occurred')
  );
});
```

---

## 7. 版本控制策略

### URL Path 版本（推荐）

```
GET /api/v1/users
GET /api/v2/users
```

简单、直观、易于路由。

### Header 版本

```
GET /api/users
Accept: application/vnd.myapp.v2+json
```

URL 更干净，但客户端使用更复杂。

### Query Parameter 版本

```
GET /api/users?version=2
```

简单但不够正式。

### 版本过渡策略

```typescript
// 版本路由
app.use('/api/v1', v1Router);
app.use('/api/v2', v2Router);

// Sunset Header（通知客户端旧版本即将废弃）
app.use('/api/v1', (req, res, next) => {
  res.set('Sunset', 'Sat, 01 Jun 2025 00:00:00 GMT');
  res.set('Deprecation', 'true');
  res.set('Link', '</api/v2>; rel="successor-version"');
  next();
});
```

---

## 8. Rate Limiting

### 8.1 Token Bucket（令牌桶）

```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, '1m'), // 100 requests per minute
  analytics: true,
  prefix: 'ratelimit',
});

async function rateLimitMiddleware(req: Request) {
  const identifier = req.headers.get('x-forwarded-for') ?? 'anonymous';
  const { success, limit, remaining, reset } = await ratelimit.limit(identifier);

  const headers = {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': new Date(reset).toISOString(),
  };

  if (!success) {
    return new Response(
      JSON.stringify(fail('RATE_LIMIT_EXCEEDED', 'Too many requests')),
      { status: 429, headers: { ...headers, 'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)) } }
    );
  }

  return null; // continue
}
```

### 8.2 Sliding Window（滑动窗口，Redis 实现）

```typescript
async function slidingWindowRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zadd(key, now, `${now}:${Math.random()}`);
  pipeline.zcard(key);
  pipeline.expire(key, windowSeconds);

  const results = await pipeline.exec();
  const count = results?.[2]?.[1] as number;

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt: now + windowSeconds * 1000,
  };
}
```

### 8.3 分层限流策略

```typescript
// 不同端点不同限流
const rateLimitConfigs = {
  'POST /api/auth/login': { limit: 5, window: '15m' },     // 登录严格限流
  'POST /api/auth/register': { limit: 3, window: '1h' },   // 注册更严格
  'GET /api/*': { limit: 100, window: '1m' },               // 读取宽松
  'POST /api/*': { limit: 30, window: '1m' },               // 写入中等
  'default': { limit: 60, window: '1m' },
};
```

---

## 9. API 文档 (OpenAPI/Swagger)

```yaml
openapi: 3.0.3
info:
  title: My API
  version: 1.0.0
  description: Production-ready REST API
  contact:
    email: api@example.com

servers:
  - url: https://api.example.com/v1
    description: Production
  - url: https://staging-api.example.com/v1
    description: Staging

paths:
  /users:
    get:
      summary: List users
      operationId: listUsers
      tags: [Users]
      parameters:
        - name: cursor
          in: query
          schema:
            type: string
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
            minimum: 1
            maximum: 100
        - name: search
          in: query
          schema:
            type: string
        - name: sort
          in: query
          schema:
            type: string
            example: "-created_at,name"
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserListResponse'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '429':
          $ref: '#/components/responses/RateLimited'

    post:
      summary: Create user
      operationId: createUser
      tags: [Users]
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateUserInput'
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserResponse'
        '422':
          $ref: '#/components/responses/ValidationError'

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

  schemas:
    User:
      type: object
      required: [id, name, email]
      properties:
        id:
          type: string
          format: uuid
        name:
          type: string
        email:
          type: string
          format: email

    CreateUserInput:
      type: object
      required: [name, email]
      properties:
        name:
          type: string
          minLength: 2
          maxLength: 50
        email:
          type: string
          format: email

  responses:
    Unauthorized:
      description: Authentication required
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
    ValidationError:
      description: Validation failed
    RateLimited:
      description: Rate limit exceeded
      headers:
        Retry-After:
          schema:
            type: integer
```

---

## 10. HATEOAS

在响应中包含相关资源的链接，帮助客户端发现 API：

```typescript
function userToHateoas(user: User, baseUrl: string) {
  return {
    ...user,
    _links: {
      self: { href: `${baseUrl}/users/${user.id}` },
      orders: { href: `${baseUrl}/users/${user.id}/orders` },
      update: { href: `${baseUrl}/users/${user.id}`, method: 'PUT' },
      delete: { href: `${baseUrl}/users/${user.id}`, method: 'DELETE' },
    },
  };
}

function listToHateoas<T>(items: T[], meta: ApiMeta, baseUrl: string, path: string) {
  return {
    data: items,
    meta,
    _links: {
      self: { href: `${baseUrl}${path}` },
      ...(meta.nextCursor && {
        next: { href: `${baseUrl}${path}?cursor=${meta.nextCursor}&limit=${meta.limit}` },
      }),
    },
  };
}
```

---

## 11. GraphQL vs REST 对比

| 特性 | REST | GraphQL |
|------|------|---------|
| 数据获取 | 固定结构，可能 over-fetch | 客户端按需查询 |
| 端点数量 | 多个端点 | 单一端点 |
| 版本控制 | URL/Header 版本 | Schema 演进 |
| 缓存 | HTTP 缓存友好 | 需要额外缓存策略 |
| 文件上传 | 原生支持 | 需要额外库 |
| 学习曲线 | 低 | 中等 |
| 实时更新 | WebSocket/SSE | Subscriptions |
| 工具生态 | 成熟 | 快速成长 |
| 适用场景 | CRUD、微服务间通信 | 复杂前端、移动端 |
| N+1 问题 | 在服务端控制 | 需要 DataLoader |

### 选择建议

- **选 REST**：简单 CRUD、微服务间通信、公开 API、需要 HTTP 缓存
- **选 GraphQL**：复杂数据关系、多客户端（Web/Mobile）不同数据需求、避免 over-fetching
- **混合使用**：REST 作为公开 API，GraphQL 作为内部 BFF（Backend for Frontend）
