---
name: postgres-patterns
description: PostgreSQL 数据类型选择、索引策略（B-tree/GIN/GiST/BRIN）、查询优化（EXPLAIN ANALYZE）、CTE、窗口函数、事务隔离级别、分区、全文搜索、JSONB、连接池、备份恢复、RLS、常用扩展深度参考。
origin: web-dev-best-practices
---

# PostgreSQL 最佳实践

PostgreSQL 数据库设计与性能优化深度参考。

## When to Activate

- 设计数据库 schema 和选择数据类型
- 优化慢查询（EXPLAIN ANALYZE 解读）
- 选择和创建索引（B-tree、GIN、GiST、BRIN）
- 编写复杂查询（CTE、窗口函数）
- 配置事务隔离级别
- 实现表分区
- 实现全文搜索（tsvector、tsquery）
- 使用 JSONB 查询和索引
- 配置连接池（PgBouncer）
- 配置备份恢复策略
- 实现 Row Level Security (RLS)

---

## 1. 数据类型选择指南

### 1.1 主键：UUID vs BIGINT

```sql
-- BIGINT：性能更好，占用更小（8 bytes），自增有序
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY

-- UUID：全局唯一，无序（16 bytes），适合分布式系统
id UUID PRIMARY KEY DEFAULT gen_random_uuid()

-- 推荐模式：内部用 BIGINT 做主键，外部暴露用 UUID
CREATE TABLE users (
    id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    uuid  UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    name  TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE
);
-- 内部 JOIN 用 id（快），API 返回用 uuid（安全、不泄露数量）
```

### 1.2 JSONB

```sql
-- 存储半结构化数据
ALTER TABLE products ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}';

-- 基本查询
SELECT * FROM products WHERE metadata->>'color' = 'red';
SELECT * FROM products WHERE metadata->'specs'->>'weight' > '100';

-- 包含查询（@> 运算符）
SELECT * FROM products WHERE metadata @> '{"tags": ["sale"]}';

-- 存在检查
SELECT * FROM products WHERE metadata ? 'warranty';
SELECT * FROM products WHERE metadata ?| ARRAY['warranty', 'guarantee'];
SELECT * FROM products WHERE metadata ?& ARRAY['color', 'size'];

-- JSONB 路径查询（PostgreSQL 12+）
SELECT * FROM products WHERE metadata @? '$.specs.weight ? (@ > 100)';

-- JSONB 聚合
SELECT
    metadata->>'category' AS category,
    COUNT(*) AS count,
    AVG((metadata->>'price')::numeric) AS avg_price
FROM products
GROUP BY metadata->>'category';

-- JSONB 更新（不可变方式）
UPDATE products
SET metadata = metadata || '{"featured": true}'::jsonb
WHERE id = 1;

UPDATE products
SET metadata = metadata - 'temporary_field'
WHERE id = 1;

UPDATE products
SET metadata = jsonb_set(metadata, '{specs,weight}', '150')
WHERE id = 1;
```

### 1.3 ARRAY

```sql
ALTER TABLE users ADD COLUMN roles TEXT[] NOT NULL DEFAULT '{}';

-- 查询
SELECT * FROM users WHERE 'admin' = ANY(roles);
SELECT * FROM users WHERE roles @> ARRAY['admin', 'editor'];
SELECT * FROM users WHERE roles && ARRAY['admin', 'editor']; -- 交集

-- 数组操作
SELECT array_agg(DISTINCT role) FROM users, unnest(roles) AS role;
```

### 1.4 TIMESTAMP WITH TIME ZONE

```sql
-- ✅ ALWAYS 使用 TIMESTAMPTZ
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

-- ❌ NEVER 使用 TIMESTAMP WITHOUT TIME ZONE
-- 会丢失时区信息，导致跨时区 bug

-- 设置默认时区
SET timezone = 'UTC';

-- 时区转换查询
SELECT created_at AT TIME ZONE 'Asia/Shanghai' AS local_time FROM events;
```

### 1.5 ENUM vs CHECK

```sql
-- ENUM：性能好，但修改需要 ALTER TYPE
CREATE TYPE order_status AS ENUM ('pending', 'processing', 'shipped', 'delivered', 'cancelled');

CREATE TABLE orders (
    id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    status order_status NOT NULL DEFAULT 'pending'
);

-- 添加值（PostgreSQL 不支持删除 ENUM 值）
ALTER TYPE order_status ADD VALUE 'refunded' AFTER 'cancelled';

-- CHECK 约束（更灵活，修改更容易）
CREATE TABLE orders (
    id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled'))
);
```

---

## 2. 索引类型与使用场景

### 2.1 B-tree（默认）

等值查询、范围查询、排序、LIKE 前缀匹配：

```sql
CREATE INDEX idx_users_email ON users (email);

-- 复合索引：遵循最左前缀原则
CREATE INDEX idx_orders_user_status_date ON orders (user_id, status, created_at);
-- ✅ 可服务: (user_id), (user_id, status), (user_id, status, created_at)
-- ❌ 不可服务: (status), (created_at), (status, created_at)

-- 覆盖索引（Index Only Scan，避免回表）
CREATE INDEX idx_orders_covering ON orders (user_id, status) INCLUDE (total_amount);

-- 降序索引（用于 ORDER BY ... DESC 查询）
CREATE INDEX idx_orders_recent ON orders (created_at DESC);
```

### 2.2 GIN（倒排索引）

适合全文搜索、JSONB、数组、模糊搜索：

```sql
-- 全文搜索
CREATE INDEX idx_articles_tsv ON articles USING GIN (search_vector);

-- JSONB（jsonb_path_ops 更紧凑，只支持 @> 操作）
CREATE INDEX idx_products_meta ON products USING GIN (metadata jsonb_path_ops);
-- 默认 GIN 支持 @>, ?, ?|, ?&
CREATE INDEX idx_products_meta_full ON products USING GIN (metadata);

-- 数组
CREATE INDEX idx_users_roles ON users USING GIN (roles);

-- pg_trgm 模糊搜索
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_users_name_trgm ON users USING GIN (name gin_trgm_ops);
SELECT * FROM users WHERE name % 'zhangsan';     -- 相似度搜索
SELECT * FROM users WHERE name ILIKE '%zhang%';   -- GIN trgm 加速 LIKE
```

### 2.3 GiST

适合地理空间、范围类型、最近邻搜索：

```sql
-- PostGIS 地理空间索引
CREATE INDEX idx_locations_geom ON locations USING GiST (geom);

-- 范围类型索引
CREATE INDEX idx_events_period ON events USING GiST (
    tstzrange(start_at, end_at)
);
-- 查询重叠时间段
SELECT * FROM events WHERE tstzrange(start_at, end_at) && tstzrange('2024-01-01', '2024-02-01');

-- pg_trgm 也可以用 GiST（适合最近邻搜索 <-> 运算符）
CREATE INDEX idx_users_name_gist ON users USING GiST (name gist_trgm_ops);
SELECT * FROM users ORDER BY name <-> 'zhangsan' LIMIT 10;
```

### 2.4 BRIN（块范围索引）

适合天然有序的超大表（时间序列），索引极小：

```sql
-- 适用条件：表的物理顺序与索引列值的逻辑顺序一致
-- 索引大小约为 B-tree 的 1/100
CREATE INDEX idx_events_created ON events USING BRIN (created_at)
    WITH (pages_per_range = 32);

-- 适合场景：日志表、事件表、时间序列表（> 1000 万行）
```

### 2.5 部分索引与唯一约束

```sql
-- 只索引常用查询条件的子集
CREATE INDEX idx_orders_pending ON orders (created_at)
    WHERE status = 'pending';

-- 唯一约束 + 软删除
CREATE UNIQUE INDEX uq_users_email_active ON users (email)
    WHERE deleted_at IS NULL;

-- 条件唯一
CREATE UNIQUE INDEX uq_team_name_org ON teams (name, org_id)
    WHERE archived = false;
```

---

## 3. 查询优化

### 3.1 EXPLAIN ANALYZE 解读

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT u.id, u.name, COUNT(o.id) AS order_count
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE u.status = 'active'
GROUP BY u.id, u.name
HAVING COUNT(o.id) > 5;
```

关键指标：

| 指标 | 含义 | 关注点 |
|------|------|--------|
| `Seq Scan` | 全表扫描 | 大表（>10K 行）应有索引 |
| `Index Scan` | 索引扫描 | ✅ 好 |
| `Index Only Scan` | 覆盖索引扫描 | ✅ 最佳（不需要回表） |
| `Bitmap Index Scan` | 位图索引扫描 | ✅ 中间结果集较大时 |
| `Nested Loop` | 嵌套循环 | 内表小时 OK |
| `Hash Join` | 哈希连接 | ✅ 大表 JOIN 的好选择 |
| `Merge Join` | 归并连接 | ✅ 两表都有序时高效 |
| `Sort` | 排序 | 注意 `external merge`（溢出磁盘） |
| `actual rows` vs `rows` | 实际 vs 估计 | 差异大时需 `ANALYZE` |
| `Buffers: shared hit` | 缓冲区命中 | 越高越好 |
| `Buffers: shared read` | 磁盘读取 | 越低越好 |

### 3.2 常见优化手段

```sql
-- 1. 更新统计信息（估算不准时）
ANALYZE users;

-- 2. 避免 SELECT *
SELECT id, name, email FROM users WHERE ...;

-- 3. 使用 EXISTS 替代 IN（子查询场景）
-- ❌ 慢
SELECT * FROM users WHERE id IN (SELECT user_id FROM orders WHERE amount > 1000);
-- ✅ 快
SELECT * FROM users u WHERE EXISTS (
    SELECT 1 FROM orders o WHERE o.user_id = u.id AND o.amount > 1000
);

-- 4. 批量插入
INSERT INTO events (type, payload, created_at)
VALUES
    ('click', '{}', now()),
    ('view', '{}', now()),
    ('purchase', '{}', now());

-- 5. UPSERT（INSERT ... ON CONFLICT）
INSERT INTO user_stats (user_id, login_count, last_login)
VALUES ($1, 1, now())
ON CONFLICT (user_id) DO UPDATE SET
    login_count = user_stats.login_count + 1,
    last_login = now();
```

---

## 4. CTE（Common Table Expressions）

### 递归查询

```sql
-- 组织架构树
WITH RECURSIVE org_tree AS (
    -- 基础：顶层节点
    SELECT id, name, manager_id, 0 AS depth, ARRAY[name] AS path
    FROM employees
    WHERE manager_id IS NULL

    UNION ALL

    -- 递归：子节点
    SELECT e.id, e.name, e.manager_id, t.depth + 1, t.path || e.name
    FROM employees e
    JOIN org_tree t ON e.manager_id = t.id
    WHERE t.depth < 10  -- 防止无限递归
)
SELECT id, name, depth, array_to_string(path, ' > ') AS full_path
FROM org_tree
ORDER BY path;
```

### 简化复杂查询

```sql
WITH active_users AS (
    SELECT id, name FROM users WHERE status = 'active'
),
recent_orders AS (
    SELECT user_id, COUNT(*) AS order_count, SUM(total) AS total_spent
    FROM orders
    WHERE created_at > now() - INTERVAL '30 days'
    GROUP BY user_id
)
SELECT
    u.name,
    COALESCE(o.order_count, 0) AS recent_orders,
    COALESCE(o.total_spent, 0) AS recent_spent
FROM active_users u
LEFT JOIN recent_orders o ON o.user_id = u.id
ORDER BY recent_spent DESC;
```

---

## 5. 窗口函数

```sql
-- 部门内排名
SELECT
    name, department, salary,
    RANK() OVER (PARTITION BY department ORDER BY salary DESC) AS rank_in_dept,
    DENSE_RANK() OVER (ORDER BY salary DESC) AS overall_dense_rank,
    ROW_NUMBER() OVER (ORDER BY salary DESC) AS row_num
FROM employees;

-- 累计和（Running Total）
SELECT
    date, amount,
    SUM(amount) OVER (ORDER BY date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_total
FROM transactions;

-- 移动平均（7 天）
SELECT
    date, revenue,
    AVG(revenue) OVER (ORDER BY date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS moving_avg_7d
FROM daily_revenue;

-- 前后行比较（环比）
SELECT
    date, revenue,
    LAG(revenue) OVER (ORDER BY date) AS prev_day,
    revenue - LAG(revenue) OVER (ORDER BY date) AS day_change,
    ROUND(
        (revenue - LAG(revenue) OVER (ORDER BY date))::numeric /
        NULLIF(LAG(revenue) OVER (ORDER BY date), 0) * 100, 2
    ) AS change_pct
FROM daily_revenue;

-- 每组取前 N 条
SELECT * FROM (
    SELECT *,
        ROW_NUMBER() OVER (PARTITION BY category ORDER BY created_at DESC) AS rn
    FROM products
) t WHERE rn <= 5;

-- NTILE 分桶
SELECT
    name, salary,
    NTILE(4) OVER (ORDER BY salary) AS quartile
FROM employees;
```

---

## 6. 事务隔离级别

| 级别 | 脏读 | 不可重复读 | 幻读 | 性能 | 适用场景 |
|------|------|-----------|------|------|---------|
| Read Uncommitted | ✅ | ✅ | ✅ | 最高 | PG 不支持，等同 Read Committed |
| Read Committed (默认) | ❌ | ✅ | ✅ | 高 | 大多数 OLTP 应用 |
| Repeatable Read | ❌ | ❌ | ❌* | 中 | 报表生成、一致性读 |
| Serializable | ❌ | ❌ | ❌ | 低 | 金融交易、严格一致性 |

*PostgreSQL 的 Repeatable Read 实际上也防止幻读

```sql
-- 设置事务隔离级别
BEGIN ISOLATION LEVEL SERIALIZABLE;
-- ... operations ...
COMMIT;

-- 处理序列化冲突（需要在应用层重试）
-- ERROR: could not serialize access due to concurrent update
```

```typescript
// 应用层事务重试
async function withSerializableRetry<T>(
  fn: (client: PoolClient) => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err.code === '40001' && attempt < maxRetries - 1) {
        continue; // 序列化冲突，重试
      }
      throw err;
    } finally {
      client.release();
    }
  }
  throw new Error('Max retries exceeded');
}
```

---

## 7. 分区

```sql
-- 范围分区（按月）
CREATE TABLE events (
    id         BIGINT GENERATED ALWAYS AS IDENTITY,
    event_type VARCHAR(50) NOT NULL,
    payload    JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

CREATE TABLE events_2024_01 PARTITION OF events
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE events_2024_02 PARTITION OF events
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

-- 默认分区（捕获不匹配的数据）
CREATE TABLE events_default PARTITION OF events DEFAULT;

-- 列表分区
CREATE TABLE orders (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    region TEXT NOT NULL,
    total NUMERIC
) PARTITION BY LIST (region);

CREATE TABLE orders_asia PARTITION OF orders FOR VALUES IN ('CN', 'JP', 'KR');
CREATE TABLE orders_eu PARTITION OF orders FOR VALUES IN ('DE', 'FR', 'UK');

-- Hash 分区（均匀分布）
CREATE TABLE logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    user_id BIGINT NOT NULL,
    message TEXT
) PARTITION BY HASH (user_id);

CREATE TABLE logs_0 PARTITION OF logs FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE logs_1 PARTITION OF logs FOR VALUES WITH (MODULUS 4, REMAINDER 1);
CREATE TABLE logs_2 PARTITION OF logs FOR VALUES WITH (MODULUS 4, REMAINDER 2);
CREATE TABLE logs_3 PARTITION OF logs FOR VALUES WITH (MODULUS 4, REMAINDER 3);

-- 自动管理分区（pg_partman 扩展）
-- DROP TABLE events_2023_01; -- 整个分区一次性删除，比 DELETE 快得多
```

---

## 8. 全文搜索

```sql
-- 添加 tsvector 列
ALTER TABLE articles ADD COLUMN search_vector tsvector;

-- 自动更新 trigger
CREATE OR REPLACE FUNCTION update_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.body, '')), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trig_update_search
    BEFORE INSERT OR UPDATE OF title, body ON articles
    FOR EACH ROW EXECUTE FUNCTION update_search_vector();

-- GIN 索引
CREATE INDEX idx_articles_search ON articles USING GIN (search_vector);

-- 查询（带排名）
SELECT title, ts_rank(search_vector, query) AS rank
FROM articles, plainto_tsquery('english', 'react performance optimization') AS query
WHERE search_vector @@ query
ORDER BY rank DESC
LIMIT 20;

-- 高亮显示匹配片段
SELECT
    title,
    ts_headline('english', body, plainto_tsquery('english', 'react'), 'MaxWords=35, MinWords=15') AS snippet
FROM articles
WHERE search_vector @@ plainto_tsquery('english', 'react');

-- 搜索建议（前缀匹配）
SELECT DISTINCT title
FROM articles
WHERE search_vector @@ to_tsquery('english', 'reac:*')
LIMIT 10;
```

---

## 9. 连接池（PgBouncer）

```ini
# pgbouncer.ini
[databases]
myapp = host=localhost port=5432 dbname=myapp

[pgbouncer]
listen_port = 6432
listen_addr = 0.0.0.0
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt

# 连接池模式
pool_mode = transaction    # transaction（推荐）/ session / statement

# 连接限制
max_client_conn = 1000     # 最大客户端连接
default_pool_size = 25     # 每个 user/database 的连接池大小
min_pool_size = 5          # 最小保持连接数
reserve_pool_size = 5      # 备用连接（突发流量）
reserve_pool_timeout = 3   # 等待备用连接的超时（秒）

# 超时
server_idle_timeout = 600  # 空闲连接回收时间
client_idle_timeout = 0    # 客户端空闲超时（0=禁用）
query_timeout = 30         # 查询超时
```

应用层连接配置：

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                    // 最大连接数
  idleTimeoutMillis: 30000,   // 空闲连接回收
  connectionTimeoutMillis: 5000, // 获取连接超时
  statement_timeout: 30000,   // 语句超时 30s
});

// 优雅关闭
process.on('SIGTERM', async () => {
  await pool.end();
});
```

---

## 10. 备份恢复

```bash
# ── 逻辑备份 ──────────────────────────────────────────────
# pg_dump（单库）
pg_dump -h localhost -U postgres -d myapp -F custom -f backup.dump
pg_dump -h localhost -U postgres -d myapp --schema-only -f schema.sql

# 恢复
pg_restore -h localhost -U postgres -d myapp -c backup.dump

# ── 物理备份 ──────────────────────────────────────────────
# pg_basebackup（整个集群）
pg_basebackup -h localhost -U replication -D /backup/base -Ft -z -P

# ── WAL 归档（时间点恢复 PITR）──────────────────────────
# postgresql.conf
# archive_mode = on
# archive_command = 'cp %p /archive/%f'
# wal_level = replica

# 恢复到指定时间点
# recovery_target_time = '2024-01-15 14:30:00'
```

---

## 11. Row Level Security (RLS)

```sql
-- 启用 RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- 读取策略：用户只能看到自己的文档
CREATE POLICY select_own_documents ON documents
    FOR SELECT
    USING (owner_id = current_setting('app.current_user_id')::BIGINT);

-- 写入策略
CREATE POLICY insert_own_documents ON documents
    FOR INSERT
    WITH CHECK (owner_id = current_setting('app.current_user_id')::BIGINT);

-- 更新策略
CREATE POLICY update_own_documents ON documents
    FOR UPDATE
    USING (owner_id = current_setting('app.current_user_id')::BIGINT)
    WITH CHECK (owner_id = current_setting('app.current_user_id')::BIGINT);

-- 管理员策略
CREATE POLICY admin_all_documents ON documents
    FOR ALL
    USING (current_setting('app.current_role') = 'admin');

-- 多租户策略
CREATE POLICY tenant_isolation ON documents
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id')::BIGINT);
```

应用层设置上下文：

```typescript
async function withRLS<T>(userId: string, role: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("SET app.current_user_id = $1", [userId]);
    await client.query("SET app.current_role = $1", [role]);
    return await fn(client);
  } finally {
    await client.query("RESET app.current_user_id");
    await client.query("RESET app.current_role");
    client.release();
  }
}
```

---

## 12. 常用扩展

```sql
-- 查询统计（性能分析必备）
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SELECT query, calls, mean_exec_time, rows
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;

-- 模糊搜索
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- UUID 生成
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

-- 查看索引使用情况
SELECT
    schemaname, tablename, indexname,
    idx_scan, idx_tup_read, idx_tup_fetch,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC;

-- 查看表大小
SELECT
    relname AS table_name,
    pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
    pg_size_pretty(pg_relation_size(relid)) AS table_size,
    pg_size_pretty(pg_indexes_size(relid)) AS indexes_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;

-- 查看未使用的索引
SELECT
    indexrelid::regclass AS index_name,
    relid::regclass AS table_name,
    idx_scan,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;
```
