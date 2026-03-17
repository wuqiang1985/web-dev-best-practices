# 数据库设计模式

> 此文件扩展 [common/patterns.md](../common/patterns.md)，添加数据库设计模式。

## 迁移管理

### 版本化迁移（必须）

```
migrations/
├── 001_create_users.sql
├── 002_create_orders.sql
├── 003_add_users_phone.sql
└── 004_create_order_items.sql
```

### 迁移规则

- **每次迁移可逆**: 提供 up + down
- **幂等性**: 可重复执行不出错
- **不修改历史迁移**: 新问题写新迁移
- **先 schema 后 data**: 结构变更和数据迁移分开

```sql
-- 001_create_users.up.sql
CREATE TABLE IF NOT EXISTS users (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email      VARCHAR(255) NOT NULL,
    name       VARCHAR(100) NOT NULL,
    status     VARCHAR(20) NOT NULL DEFAULT 'active'
        CONSTRAINT chk_users_status CHECK (status IN ('active', 'inactive', 'banned')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT uq_users_email UNIQUE (email)
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_status ON users (status);

-- 001_create_users.down.sql
DROP TABLE IF EXISTS users;
```

### 零停机迁移策略

| 操作 | 安全方式 |
|------|----------|
| 加列 | 直接 `ADD COLUMN`（不加 NOT NULL） |
| 删列 | 先停止读取 → 部署 → 再删列 |
| 重命名列 | 加新列 → 同步数据 → 迁移代码 → 删旧列 |
| 加索引 | `CREATE INDEX CONCURRENTLY`（不锁表） |
| 改类型 | 加新列 → 数据转换 → 切换 → 删旧列 |

## 连接池

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  max: 20,                      // 最大连接数（按 CPU 核心 * 2 + 1）
  min: 5,                       // 最小空闲连接
  idleTimeoutMillis: 30000,     // 空闲连接回收（30s）
  connectionTimeoutMillis: 5000, // 获取连接超时（5s）
});

// ✅ 使用 pool.query() 自动获取和释放连接
const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);

// ✅ 事务时手动管理
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [amount, fromId]);
  await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [amount, toId]);
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release(); // 必须释放！
}
```

## 事务管理

### ACID 原则

- **Atomicity**: 全部成功或全部回滚
- **Consistency**: 满足所有约束
- **Isolation**: 并发事务互不干扰
- **Durability**: 提交后持久保存

### 隔离级别

| 级别 | 脏读 | 不可重复读 | 幻读 | 性能 | 适用场景 |
|------|------|-----------|------|------|----------|
| Read Committed（默认） | ✅ 防 | ❌ | ❌ | 高 | 大多数场景 |
| Repeatable Read | ✅ 防 | ✅ 防 | ❌ | 中 | 报表查询 |
| Serializable | ✅ 防 | ✅ 防 | ✅ 防 | 低 | 金融交易 |

### 避免长事务

```typescript
// ❌ BAD: 事务中包含外部 API 调用
await client.query('BEGIN');
await client.query('INSERT INTO orders ...');
const result = await callExternalApi(); // 可能很慢！
await client.query('UPDATE inventory ...');
await client.query('COMMIT');

// ✅ GOOD: 先处理外部调用，再开事务
const apiResult = await callExternalApi();
await client.query('BEGIN');
await client.query('INSERT INTO orders ...');
await client.query('UPDATE inventory ...');
await client.query('COMMIT');
```

## Repository 模式

```typescript
interface UserRepository {
  findById(id: string): Promise<User | null>;
  findAll(filters: UserFilters): Promise<PaginatedResult<User>>;
  create(data: CreateUserInput): Promise<User>;
  update(id: string, data: UpdateUserInput): Promise<User>;
  delete(id: string): Promise<void>;
}

class PostgresUserRepository implements UserRepository {
  constructor(private pool: Pool) {}

  async findById(id: string): Promise<User | null> {
    const result = await this.pool.query(
      'SELECT id, email, name, status, created_at FROM users WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    return result.rows[0] ?? null;
  }

  async create(data: CreateUserInput): Promise<User> {
    const result = await this.pool.query(
      'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING *',
      [data.email, data.name]
    );
    return result.rows[0];
  }
}
```

## N+1 查询防范

```typescript
// ❌ BAD: N+1 查询
const users = await db.query('SELECT * FROM users');
for (const user of users.rows) {
  const orders = await db.query('SELECT * FROM orders WHERE user_id = $1', [user.id]);
  user.orders = orders.rows;
}

// ✅ GOOD: JOIN 查询
const result = await db.query(`
  SELECT u.*, json_agg(o.*) FILTER (WHERE o.id IS NOT NULL) AS orders
  FROM users u
  LEFT JOIN orders o ON o.user_id = u.id
  GROUP BY u.id
`);

// ✅ GOOD: 批量查询
const users = await db.query('SELECT * FROM users');
const userIds = users.rows.map(u => u.id);
const orders = await db.query(
  'SELECT * FROM orders WHERE user_id = ANY($1)',
  [userIds]
);
```

## 乐观锁 vs 悲观锁

```sql
-- 乐观锁：version 字段
UPDATE products
SET name = 'New Name', version = version + 1
WHERE id = 123 AND version = 5;
-- 如果 affected_rows = 0，说明被其他事务修改了

-- 悲观锁：SELECT FOR UPDATE
SELECT * FROM products WHERE id = 123 FOR UPDATE;
-- 其他事务尝试锁定同一行会等待
UPDATE products SET stock = stock - 1 WHERE id = 123;
```
