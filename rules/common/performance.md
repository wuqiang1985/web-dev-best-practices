# 性能规范

> Web 应用性能优化基线，覆盖前端、API 和数据库。

## 前端性能

### 代码分割

```typescript
// ✅ 路由级别代码分割
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Settings = lazy(() => import('./pages/Settings'));

// ✅ 组件级别按需加载
const HeavyChart = lazy(() => import('./components/HeavyChart'));
```

### 图片优化

- 使用 WebP / AVIF 格式
- 配置 `loading="lazy"` 延迟加载
- 提供 `width` 和 `height` 避免布局偏移
- 使用 `<picture>` + `srcset` 响应式图片

### 虚拟列表

超过 100 条列表数据时使用虚拟化：

```typescript
// 使用 @tanstack/react-virtual 或 react-virtuoso
import { useVirtualizer } from '@tanstack/react-virtual';
```

### 监控指标

| 指标 | 目标 | 说明 |
|------|------|------|
| LCP | < 2.5s | 最大内容绘制 |
| FID | < 100ms | 首次输入延迟 |
| CLS | < 0.1 | 累积布局偏移 |
| TTFB | < 800ms | 首字节时间 |
| Bundle Size | < 200KB (gzip) | 初始包大小 |

## API 性能

### 缓存策略

```typescript
// HTTP 缓存头
{
  'Cache-Control': 'public, max-age=3600',      // 静态资源
  'Cache-Control': 'no-cache',                    // 动态数据（使用 ETag）
  'Cache-Control': 'private, no-store',           // 敏感数据
  'ETag': '"abc123"',                             // 条件请求
}
```

### 响应压缩

```typescript
// 启用 gzip/brotli 压缩
app.use(compression());
```

### 分页（必须）

```typescript
// ❌ BAD: 返回全部数据
app.get('/api/users', () => db.query('SELECT * FROM users'));

// ✅ GOOD: 默认分页
app.get('/api/users', (req) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const cursor = req.query.cursor;
  return db.query('SELECT * FROM users WHERE id > $1 LIMIT $2', [cursor, limit]);
});
```

## 数据库性能

### 索引优化

```sql
-- WHERE 条件列加索引
CREATE INDEX idx_users_email ON users (email);

-- 复合索引（选择性高的列在前）
CREATE INDEX idx_orders_user_status ON orders (user_id, status);

-- 定期检查索引使用
SELECT * FROM pg_stat_user_indexes WHERE idx_scan = 0;
```

### 查询优化

```sql
-- ❌ BAD: SELECT *
SELECT * FROM users WHERE status = 'active';

-- ✅ GOOD: 只选需要的列
SELECT id, name, email FROM users WHERE status = 'active';

-- ❌ BAD: N+1 查询
-- 循环中逐个查询关联数据

-- ✅ GOOD: JOIN 或批量查询
SELECT u.id, u.name, json_agg(o.*) as orders
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE u.status = 'active'
GROUP BY u.id;
```

### 连接池

```typescript
// ✅ 合理配置连接池
const pool = new Pool({
  max: 20,           // 最大连接数
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
```

## 缓存层次

```
客户端缓存（浏览器）
  → CDN 缓存（静态资源）
    → 应用缓存（Redis）
      → 数据库查询缓存
        → 数据库
```

## 常见反模式

| 反模式 | 影响 | 修复 |
|--------|------|------|
| N+1 查询 | 数据库负载暴增 | JOIN / 批量查询 |
| 不必要的重渲染 | UI 卡顿 | React.memo / useMemo |
| 全量数据加载 | 内存溢出 | 分页 / 虚拟列表 |
| 同步 I/O | 线程阻塞 | 异步操作 |
| 未压缩资源 | 带宽浪费 | gzip / brotli |
| 缺少索引 | 全表扫描 | EXPLAIN + 加索引 |
| 过大的 Bundle | 首屏慢 | 代码分割 + Tree-shaking |
