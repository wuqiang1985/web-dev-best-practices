# REST API 设计规范

> 团队 REST API 设计统一标准，确保接口风格一致、易于使用和维护。

## 资源命名

| 规则 | 正确 | 错误 |
|------|------|------|
| 复数名词 | `/api/users` | `/api/user` |
| kebab-case | `/api/order-items` | `/api/orderItems` |
| 嵌套资源 | `/api/users/:id/orders` | `/api/getUserOrders` |
| 版本前缀 | `/api/v1/users` | `/api/users?v=1` |
| 无动词 | `POST /api/users` | `GET /api/createUser` |

## HTTP 方法语义

| 方法 | 语义 | 幂等 | 示例 |
|------|------|------|------|
| `GET` | 查询资源 | ✅ | `GET /api/users/123` |
| `POST` | 创建资源 | ❌ | `POST /api/users` |
| `PUT` | 全量替换 | ✅ | `PUT /api/users/123` |
| `PATCH` | 部分更新 | ✅ | `PATCH /api/users/123` |
| `DELETE` | 删除资源 | ✅ | `DELETE /api/users/123` |

## 状态码

### 成功

| 状态码 | 含义 | 使用场景 |
|--------|------|----------|
| `200 OK` | 成功 | GET、PUT、PATCH |
| `201 Created` | 创建成功 | POST |
| `204 No Content` | 成功无返回体 | DELETE |

### 客户端错误

| 状态码 | 含义 | 使用场景 |
|--------|------|----------|
| `400 Bad Request` | 请求格式错误 | 缺少必填字段、类型错误 |
| `401 Unauthorized` | 未认证 | 缺少或无效的 token |
| `403 Forbidden` | 无权限 | 认证通过但权限不足 |
| `404 Not Found` | 资源不存在 | ID 不存在 |
| `409 Conflict` | 冲突 | 重复创建、版本冲突 |
| `422 Unprocessable Entity` | 验证失败 | 业务规则不满足 |
| `429 Too Many Requests` | 限流 | 超出请求频率限制 |

### 服务端错误

| 状态码 | 含义 |
|--------|------|
| `500 Internal Server Error` | 未处理的服务端错误 |
| `502 Bad Gateway` | 上游服务异常 |
| `503 Service Unavailable` | 服务暂不可用 |

## 响应格式（统一信封）

### 成功响应

```json
{
  "success": true,
  "data": {
    "id": "user_123",
    "name": "张三",
    "email": "zhang@example.com"
  },
  "meta": null
}
```

### 列表响应（带分页）

```json
{
  "success": true,
  "data": [
    { "id": "user_123", "name": "张三" },
    { "id": "user_456", "name": "李四" }
  ],
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "hasNext": true,
    "nextCursor": "eyJpZCI6InVzZXJfNDU2In0="
  }
}
```

### 错误响应

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求参数验证失败",
    "details": [
      { "field": "email", "message": "邮箱格式不正确" },
      { "field": "age", "message": "年龄必须大于 0" }
    ]
  }
}
```

## 分页

### Cursor-based（推荐）

```
GET /api/users?cursor=eyJpZCI6MTAwfQ==&limit=20
```

优势：一致性好、适合实时数据、性能稳定

### Offset-based（简单场景）

```
GET /api/users?page=2&limit=20
```

## 过滤与排序

```
GET /api/users?status=active&role=admin          # 过滤
GET /api/users?sort=-created_at,name             # 排序（- 前缀表示降序）
GET /api/users?search=张三                        # 搜索
GET /api/users?fields=id,name,email              # 字段选择
```

## 请求验证

所有端点必须使用 schema 验证请求体：

```typescript
import { z } from 'zod';

const CreateUserSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  name: z.string().min(1, '姓名不能为空').max(100),
  role: z.enum(['admin', 'user', 'viewer']).default('user'),
});

// Express middleware
app.post('/api/users', validate(CreateUserSchema), createUser);
```

## 版本控制

使用 URL 路径版本：`/api/v1/users`

- v1 和 v2 可并行运行
- 旧版本设定废弃日期
- Breaking changes 必须升级版本号

## Rate Limiting

所有公开 API 必须配置限流：

```
X-RateLimit-Limit: 100       # 窗口内最大请求数
X-RateLimit-Remaining: 95    # 剩余请求数
X-RateLimit-Reset: 1640000000 # 窗口重置时间戳
```
