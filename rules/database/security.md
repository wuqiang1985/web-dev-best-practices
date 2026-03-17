# 数据库安全

> 此文件扩展 [common/security.md](../common/security.md)，添加数据库安全特定内容。

## 参数化查询（CRITICAL）

```typescript
// ❌ CRITICAL: SQL 注入漏洞
const query = `SELECT * FROM users WHERE email = '${email}'`;
const query = `DELETE FROM orders WHERE id = ${req.params.id}`;

// ✅ GOOD: 参数化查询
const query = 'SELECT * FROM users WHERE email = $1';
const result = await pool.query(query, [email]);

// ✅ GOOD: ORM（自动参数化）
const user = await prisma.user.findUnique({ where: { email } });
const user = await db.select().from(users).where(eq(users.email, email));
```

## 权限最小化

### 应用数据库账号

```sql
-- 创建只读账号
CREATE ROLE app_readonly WITH LOGIN PASSWORD 'xxx';
GRANT CONNECT ON DATABASE mydb TO app_readonly;
GRANT USAGE ON SCHEMA public TO app_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly;

-- 创建读写账号（不含 DDL 权限）
CREATE ROLE app_readwrite WITH LOGIN PASSWORD 'xxx';
GRANT CONNECT ON DATABASE mydb TO app_readwrite;
GRANT USAGE ON SCHEMA public TO app_readwrite;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_readwrite;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_readwrite;

-- ❌ NEVER: 应用使用 superuser
-- ❌ NEVER: GRANT ALL PRIVILEGES
```

## 行级安全（RLS）

多租户场景必须启用：

```sql
-- 启用 RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- 用户只能访问自己的数据
CREATE POLICY user_orders ON orders
    FOR ALL
    USING (user_id = current_setting('app.current_user_id')::BIGINT);
```

## 数据加密

```typescript
// 密码：使用 bcrypt 或 argon2
import bcrypt from 'bcrypt';

const hash = await bcrypt.hash(password, 12);
const isValid = await bcrypt.compare(inputPassword, hash);

// ❌ NEVER: 明文存储密码
// ❌ NEVER: 使用 MD5/SHA1 存储密码
// ❌ NEVER: 自行实现加密算法
```

## 审计日志

关键操作记录 who / what / when：

```sql
CREATE TABLE audit_logs (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    action      VARCHAR(50) NOT NULL,     -- CREATE, UPDATE, DELETE
    table_name  VARCHAR(100) NOT NULL,
    record_id   BIGINT NOT NULL,
    old_values  JSONB,
    new_values  JSONB,
    ip_address  INET,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_user ON audit_logs (user_id);
CREATE INDEX idx_audit_logs_table_record ON audit_logs (table_name, record_id);
```

## 备份策略

| 项目 | 要求 |
|------|------|
| 备份频率 | 每日全量 + 持续 WAL 归档 |
| 保留周期 | 至少 30 天 |
| 存储加密 | AES-256 |
| 恢复测试 | 每月至少一次 |
| 跨区存储 | 至少两个不同区域 |

## 连接安全

```typescript
// ✅ 强制 SSL 连接
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: true,
    ca: fs.readFileSync('/path/to/ca-cert.pem'),
  },
});
```

## 安全检查清单

- [ ] 所有查询使用参数化
- [ ] 应用账号权限最小化（无 DDL）
- [ ] 敏感数据加密存储
- [ ] 启用 SSL/TLS 连接
- [ ] 关键操作有审计日志
- [ ] 定期备份且测试恢复
- [ ] 多租户场景启用 RLS
- [ ] 数据库端口不暴露公网
