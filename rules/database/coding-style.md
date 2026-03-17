# 数据库编码风格

> 此文件扩展 [common/coding-style.md](../common/coding-style.md)，添加数据库特定内容。

## 命名约定

| 类型 | 风格 | 示例 |
|------|------|------|
| 表名 | snake_case 复数 | `users`, `order_items` |
| 列名 | snake_case | `created_at`, `user_id` |
| 主键 | `id` | `id BIGINT GENERATED ALWAYS AS IDENTITY` |
| 外键 | `target_id` | `user_id`, `order_id` |
| 索引 | `idx_table_columns` | `idx_users_email` |
| 唯一约束 | `uq_table_columns` | `uq_users_email` |
| 检查约束 | `chk_table_condition` | `chk_orders_amount_positive` |
| 外键约束 | `fk_source_target` | `fk_orders_user` |

## 数据类型选择

| 场景 | 推荐类型 | 说明 |
|------|----------|------|
| 主键 | `BIGINT` 或 `UUID` | 高并发用 UUID，简单场景用 BIGINT |
| 时间 | `TIMESTAMP WITH TIME ZONE` | 始终带时区 |
| 金额 | `NUMERIC(precision, scale)` | 绝不用 FLOAT |
| 短文本 | `VARCHAR(n)` | 有明确长度限制 |
| 长文本 | `TEXT` | 无需预设长度 |
| 布尔 | `BOOLEAN` | 不用 INT 代替 |
| JSON | `JSONB` | 优于 JSON（支持索引） |
| 枚举 | `VARCHAR` + `CHECK` | 优于 ENUM 类型（更灵活） |

## 必备列

每张表都应包含：

```sql
CREATE TABLE users (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- 业务字段...
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
```

## 软删除

```sql
-- 方案 A: deleted_at 列（推荐）
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;

-- 查询时排除已删除
SELECT * FROM users WHERE deleted_at IS NULL;

-- 方案 B: 只在必要时使用物理删除
-- 适用于：临时数据、日志、GDPR 合规要求
```

## 枚举处理

```sql
-- ✅ GOOD: CHECK 约束（灵活，易修改）
ALTER TABLE orders ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CONSTRAINT chk_orders_status CHECK (status IN ('pending', 'processing', 'completed', 'cancelled'));

-- ❌ AVOID: ENUM 类型（难以修改、迁移麻烦）
CREATE TYPE order_status AS ENUM ('pending', 'processing');
```

## SQL 编写规范

```sql
-- ✅ GOOD: 关键字大写，缩进对齐
SELECT
    u.id,
    u.name,
    u.email,
    COUNT(o.id) AS order_count
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE u.status = 'active'
    AND u.created_at > '2024-01-01'
GROUP BY u.id, u.name, u.email
HAVING COUNT(o.id) > 5
ORDER BY order_count DESC
LIMIT 20;

-- ❌ BAD: 全部小写、无缩进
select u.id, u.name, u.email, count(o.id) as order_count from users u left join orders o on o.user_id = u.id where u.status = 'active' and u.created_at > '2024-01-01' group by u.id, u.name, u.email having count(o.id) > 5 order by order_count desc limit 20;
```
