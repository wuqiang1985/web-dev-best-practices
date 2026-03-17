# 数据库性能

> 此文件扩展 [common/performance.md](../common/performance.md)，添加数据库性能优化内容。

## 索引策略

### 何时加索引

- WHERE 条件列
- JOIN 关联列
- ORDER BY 排序列
- 频繁查询的外键列
- UNIQUE 约束列（自动创建）

### 索引类型

| 类型 | 适用场景 | 示例 |
|------|----------|------|
| B-tree（默认） | 等值、范围、排序 | 大多数场景 |
| Hash | 纯等值查询 | 精确匹配 |
| GIN | 全文搜索、JSONB、数组 | `WHERE tags @> '{react}'` |
| GiST | 地理位置、范围类型 | PostGIS 空间查询 |
| BRIN | 有序大表（时间序列） | 日志表按时间范围 |

### 复合索引

```sql
-- 列顺序很重要：选择性高的在前
-- 查询：WHERE status = 'active' AND created_at > '2024-01-01'
CREATE INDEX idx_users_status_created ON users (status, created_at);

-- ✅ 此索引可服务于：
-- WHERE status = 'active'
-- WHERE status = 'active' AND created_at > '2024-01-01'

-- ❌ 此索引无法服务于：
-- WHERE created_at > '2024-01-01'（缺少左前缀）
```

### 部分索引

```sql
-- 只索引需要的行（节省空间和维护成本）
CREATE INDEX idx_orders_pending ON orders (created_at)
    WHERE status = 'pending';

-- 只有 10% 的订单是 pending，索引小 10 倍
```

### 表达式索引

```sql
-- 对计算字段加索引
CREATE INDEX idx_users_email_lower ON users (LOWER(email));

-- 查询时使用同样的表达式
SELECT * FROM users WHERE LOWER(email) = 'test@example.com';
```

## 查询优化

### EXPLAIN ANALYZE

```sql
-- 分析查询执行计划
EXPLAIN ANALYZE
SELECT u.*, COUNT(o.id)
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE u.status = 'active'
GROUP BY u.id;

-- 关注指标：
-- Seq Scan → 全表扫描（大表需要索引）
-- Nested Loop → 嵌套循环（小数据集 OK，大数据集需要 Hash Join）
-- Sort → 排序（内存不足时会溢出到磁盘）
-- actual time → 实际执行时间
-- rows → 实际行数 vs 估计行数
```

### 常见优化

```sql
-- ❌ BAD: SELECT *
SELECT * FROM users WHERE id = 1;

-- ✅ GOOD: 只选需要的列
SELECT id, name, email FROM users WHERE id = 1;

-- ❌ BAD: 不带 LIMIT 的查询
SELECT * FROM logs WHERE level = 'error';

-- ✅ GOOD: 适当限制
SELECT * FROM logs WHERE level = 'error' ORDER BY created_at DESC LIMIT 100;

-- ❌ BAD: LIKE 以通配符开头（无法使用索引）
SELECT * FROM users WHERE name LIKE '%张%';

-- ✅ GOOD: 前缀匹配（可使用索引）
SELECT * FROM users WHERE name LIKE '张%';

-- ✅ BETTER: 全文搜索
SELECT * FROM users WHERE name_tsv @@ to_tsquery('chinese', '张三');
```

### 子查询 vs JOIN

```sql
-- ❌ 慢: 相关子查询（每行执行一次）
SELECT *, (SELECT COUNT(*) FROM orders WHERE user_id = u.id) AS order_count
FROM users u;

-- ✅ 快: JOIN + GROUP BY
SELECT u.*, COUNT(o.id) AS order_count
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
GROUP BY u.id;

-- ✅ 也可以: lateral join（复杂场景）
```

## 分区策略

### 范围分区（时间序列数据）

```sql
CREATE TABLE events (
    id         BIGINT GENERATED ALWAYS AS IDENTITY,
    event_type VARCHAR(50) NOT NULL,
    payload    JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

CREATE TABLE events_2024_q1 PARTITION OF events
    FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');
CREATE TABLE events_2024_q2 PARTITION OF events
    FOR VALUES FROM ('2024-04-01') TO ('2024-07-01');
```

适用场景：
- 日志表 > 1000 万行
- 时间序列数据
- 需要定期归档旧数据

## 缓存层次

```
应用层                    数据库层
┌─────────────┐          ┌──────────────────┐
│ TanStack    │  cache   │                  │
│ Query 缓存  │  miss    │  PostgreSQL      │
│ (5min TTL)  │ ───────► │  shared_buffers  │
└─────────────┘          │  (查询缓存)       │
       │                 └──────────────────┘
  cache miss                    │
       │                   cache miss
       ▼                        │
┌─────────────┐                 ▼
│ Redis 缓存   │          ┌──────────────────┐
│ (15min TTL) │          │  磁盘 I/O        │
└─────────────┘          └──────────────────┘
```

## 监控指标

| 指标 | 告警阈值 | 说明 |
|------|----------|------|
| 慢查询 | > 1s | 开启 `log_min_duration_statement` |
| 连接数 | > 80% max | 检查连接泄漏 |
| 锁等待 | > 5s | 检查死锁和长事务 |
| 缓存命中率 | < 95% | 增加 `shared_buffers` |
| 磁盘使用 | > 80% | 清理或扩容 |
| 复制延迟 | > 10s | 检查网络和 WAL |

```sql
-- 查看慢查询（需要 pg_stat_statements 扩展）
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;

-- 查看未使用的索引
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;
```
