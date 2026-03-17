---
name: redis-patterns
description: Redis 数据结构选择、缓存策略（Cache-Aside/Write-Through/Write-Behind）、缓存失效防护、分布式锁（Redlock）、消息队列（Streams/Pub-Sub）、Rate Limiting、会话管理、排行榜、地理位置、集群与哨兵、内存优化、ioredis 集成深度参考。
origin: web-dev-best-practices
---

# Redis 使用模式

Redis 在 Web 应用中的常见使用模式与最佳实践深度参考。

## When to Activate

- 设计缓存策略（Cache-Aside、Write-Through、Write-Behind）
- 选择 Redis 数据结构
- 实现缓存失效防护（穿透、雪崩、击穿）
- 实现分布式锁（Redlock）
- 使用 Redis Streams 或 Pub/Sub 作为消息队列
- 实现 Rate Limiting
- 管理用户会话
- 实现排行榜（Sorted Set）
- 使用地理位置命令（GEO）
- 配置集群与哨兵
- 优化 Redis 内存使用
- 与 Node.js 集成（ioredis）

---

## 1. 数据结构选择

| 数据结构 | 适用场景 | 示例 | 时间复杂度 |
|----------|----------|------|-----------|
| String | 简单缓存、计数器、分布式锁 | Session、API 响应、原子计数 | O(1) |
| Hash | 对象存储 | 用户资料、商品信息 | O(1) per field |
| List | 队列、最近记录 | 消息队列、最近浏览 | O(1) push/pop |
| Set | 去重集合、标签、交并差 | 在线用户、标签系统 | O(1) add/remove |
| Sorted Set | 排行榜、延时队列、优先级 | 积分排行、定时任务 | O(log N) |
| Stream | 事件流、消费者组 | 日志收集、事件处理 | O(1) append |
| HyperLogLog | 基数估计（去重计数） | UV 统计 | O(1)，极小内存 |
| Bitmap | 位操作、布尔状态 | 用户签到、特性标志 | O(1) |

```typescript
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);

// String
await redis.set('key', 'value', 'EX', 3600);
await redis.incr('counter');
await redis.incrby('counter', 5);

// Hash
await redis.hset('user:1', { name: 'Alice', email: 'alice@example.com', age: '30' });
await redis.hget('user:1', 'name');
await redis.hgetall('user:1');
await redis.hincrby('user:1', 'age', 1);

// List
await redis.lpush('queue', 'task1', 'task2');
await redis.rpop('queue');
await redis.lrange('recent:user:1', 0, 9); // 最近 10 条

// Set
await redis.sadd('online:users', 'user1', 'user2');
await redis.sismember('online:users', 'user1');
await redis.sinter('followers:1', 'followers:2'); // 共同关注

// Sorted Set
await redis.zadd('leaderboard', 100, 'player1', 200, 'player2');
await redis.zrevrange('leaderboard', 0, 9, 'WITHSCORES'); // Top 10
```

---

## 2. 缓存策略

### 2.1 Cache-Aside（旁路缓存，最常用）

```typescript
async function getUser(userId: string): Promise<User> {
  const cacheKey = `user:${userId}`;

  // 1. 先查缓存
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as User;

  // 2. 缓存未命中，查数据库
  const user = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
  if (!user) throw new NotFoundError('User', userId);

  // 3. 写入缓存（TTL 15 min）
  await redis.setex(cacheKey, 900, JSON.stringify(user));

  return user;
}

// 数据变更时失效缓存
async function updateUser(userId: string, data: UpdateUserInput): Promise<User> {
  const user = await db.query(
    'UPDATE users SET name = $1 WHERE id = $2 RETURNING *',
    [data.name, userId]
  );

  // 删除缓存（下次读取时重建）
  await redis.del(`user:${userId}`);

  // 同时失效列表缓存
  await redis.del('users:list:*'); // 使用 pattern 或 tag

  return user;
}
```

### 2.2 Write-Through（写透缓存）

写入时同时更新缓存和数据库，保持一致性：

```typescript
async function createOrder(data: CreateOrderInput): Promise<Order> {
  const order = await db.query(
    'INSERT INTO orders (user_id, total, status) VALUES ($1, $2, $3) RETURNING *',
    [data.userId, data.total, 'pending']
  );

  // 同时写入缓存
  await redis.setex(`order:${order.id}`, 3600, JSON.stringify(order));

  // 更新用户的订单列表缓存
  await redis.lpush(`user:${data.userId}:orders`, order.id);
  await redis.ltrim(`user:${data.userId}:orders`, 0, 99); // 保留最近 100 条

  return order;
}
```

### 2.3 Write-Behind（异步写回）

先更新缓存，异步写入数据库（高吞吐，但有数据丢失风险）：

```typescript
// 高频写入场景：点赞计数
async function incrementLike(postId: string): Promise<number> {
  const count = await redis.incr(`post:${postId}:likes`);

  // 每 100 次写回一次数据库（或定时批量写回）
  if (count % 100 === 0) {
    await db.query(
      'UPDATE posts SET like_count = $1 WHERE id = $2',
      [count, postId]
    );
  }

  return count;
}

// 定时批量写回
async function syncLikesToDB() {
  const keys = await redis.keys('post:*:likes');
  const pipeline = redis.pipeline();

  for (const key of keys) {
    pipeline.get(key);
  }

  const results = await pipeline.exec();
  // ... batch update to database
}
```

---

## 3. 缓存失效防护

### 3.1 缓存穿透防护（查询不存在的数据）

```typescript
async function getUserSafe(userId: string): Promise<User | null> {
  const cacheKey = `user:${userId}`;
  const cached = await redis.get(cacheKey);

  // 空值标记：防止重复查库
  if (cached === '__NULL__') return null;
  if (cached) return JSON.parse(cached);

  const user = await db.query('SELECT * FROM users WHERE id = $1', [userId]);

  if (!user) {
    // 缓存空值，短 TTL（防止大量无效 ID 打到数据库）
    await redis.setex(cacheKey, 60, '__NULL__');
    return null;
  }

  await redis.setex(cacheKey, 900, JSON.stringify(user));
  return user;
}

// 布隆过滤器（Redis 扩展 RedisBloom）
// 在查缓存前先检查布隆过滤器，ID 一定不存在则直接返回
async function getUserWithBloom(userId: string): Promise<User | null> {
  const exists = await redis.call('BF.EXISTS', 'users:bloom', userId);
  if (!exists) return null; // 一定不存在

  return getUserSafe(userId);
}
```

### 3.2 缓存雪崩防护（大量 key 同时过期）

```typescript
// 加随机 TTL 偏移量，避免同时过期
function setWithJitter(key: string, value: string, baseTtl: number): Promise<string> {
  const jitter = Math.floor(Math.random() * 60); // 0-60 秒随机偏移
  return redis.setex(key, baseTtl + jitter, value);
}

// 预热：启动时预加载热点数据
async function warmupCache() {
  const hotUsers = await db.query('SELECT * FROM users ORDER BY last_active DESC LIMIT 1000');
  const pipeline = redis.pipeline();

  for (const user of hotUsers) {
    const ttl = 900 + Math.floor(Math.random() * 300);
    pipeline.setex(`user:${user.id}`, ttl, JSON.stringify(user));
  }

  await pipeline.exec();
}
```

### 3.3 缓存击穿防护（热点 key 过期）

```typescript
import Redlock from 'redlock';

const redlock = new Redlock([redis]);

async function getHotData(key: string, fetchFn: () => Promise<unknown>): Promise<unknown> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  // 互斥锁：只有一个请求去查库
  const lockKey = `lock:${key}`;
  const lock = await redlock.acquire([lockKey], 5000);

  try {
    // 双重检查：获取锁后再查一次缓存
    const cachedAgain = await redis.get(key);
    if (cachedAgain) return JSON.parse(cachedAgain);

    const data = await fetchFn();
    await redis.setex(key, 3600, JSON.stringify(data));
    return data;
  } finally {
    await lock.release();
  }
}

// 逻辑过期（不设 TTL，在 value 中嵌入过期时间）
interface CachedValue<T> {
  data: T;
  expiresAt: number;
}

async function getWithLogicalExpiry<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
  const cached = await redis.get(key);
  if (cached) {
    const parsed: CachedValue<T> = JSON.parse(cached);
    if (Date.now() < parsed.expiresAt) {
      return parsed.data; // 未过期
    }
    // 已过期，异步刷新（返回旧数据，后台更新）
    refreshInBackground(key, fetchFn);
    return parsed.data;
  }

  // 首次加载
  const data = await fetchFn();
  const value: CachedValue<T> = { data, expiresAt: Date.now() + 3600_000 };
  await redis.set(key, JSON.stringify(value)); // 不设 TTL
  return data;
}
```

---

## 4. 分布式锁（Redlock）

```typescript
import Redlock from 'redlock';

const redlock = new Redlock([redis], {
  driftFactor: 0.01,
  retryCount: 3,
  retryDelay: 200,
  retryJitter: 100,
  automaticExtensionThreshold: 500,
});

// 防止并发处理同一订单
async function processOrder(orderId: string) {
  const lock = await redlock.acquire([`lock:order:${orderId}`], 30000);

  try {
    const order = await getOrder(orderId);
    if (order.status !== 'pending') return; // 幂等检查

    await fulfillOrder(order);
    await updateOrderStatus(orderId, 'processing');
  } finally {
    await lock.release();
  }
}

// 使用 using 自动释放（需要 Redlock v5+）
async function processPayment(paymentId: string) {
  using lock = await redlock.acquire([`lock:payment:${paymentId}`], 10000);

  // lock 在 scope 结束时自动释放
  await executePayment(paymentId);
}

// 锁续期（长时间任务）
async function longRunningTask(taskId: string) {
  let lock = await redlock.acquire([`lock:task:${taskId}`], 10000);

  try {
    for (const step of steps) {
      await processStep(step);
      // 续期锁
      lock = await lock.extend(10000);
    }
  } finally {
    await lock.release();
  }
}
```

---

## 5. 消息队列

### 5.1 Redis Streams（推荐）

```typescript
// ── 生产者 ────────────────────────────────────────────────
async function publishEvent(stream: string, event: Record<string, string>) {
  const id = await redis.xadd(stream, '*', ...Object.entries(event).flat());
  return id;
}

await publishEvent('events:orders', {
  type: 'order_created',
  orderId: '123',
  userId: 'user_1',
  timestamp: Date.now().toString(),
});

// ── 消费者组 ──────────────────────────────────────────────
// 创建消费者组
await redis.xgroup('CREATE', 'events:orders', 'order-processors', '0', 'MKSTREAM');

// 消费消息
async function consumeMessages(group: string, consumer: string, stream: string) {
  while (true) {
    const messages = await redis.xreadgroup(
      'GROUP', group, consumer,
      'COUNT', 10,
      'BLOCK', 5000, // 阻塞等待 5 秒
      'STREAMS', stream, '>'
    );

    if (!messages) continue;

    for (const [, entries] of messages) {
      for (const [id, fields] of entries) {
        try {
          await processMessage(Object.fromEntries(
            fields.reduce<[string, string][]>((acc, val, i, arr) => {
              if (i % 2 === 0) acc.push([val, arr[i + 1]]);
              return acc;
            }, [])
          ));
          // 确认消息已处理
          await redis.xack(stream, group, id);
        } catch (error) {
          console.error(`Failed to process message ${id}:`, error);
          // 消息会保留在 PEL 中，可以重试
        }
      }
    }
  }
}

// 处理未确认的消息（死信处理）
async function claimPendingMessages(group: string, consumer: string, stream: string) {
  const pending = await redis.xpending(stream, group, '-', '+', 100);

  for (const [id, , idleTime] of pending) {
    if (idleTime > 60000) { // 超过 1 分钟未确认
      const claimed = await redis.xclaim(
        stream, group, consumer,
        60000, // min idle time
        id
      );
      // 重新处理或移入死信队列
    }
  }
}
```

### 5.2 Pub/Sub

适合实时通知，消息不持久化：

```typescript
// 发布者
async function publishNotification(channel: string, message: object) {
  await redis.publish(channel, JSON.stringify(message));
}

// 订阅者（需要独立的 Redis 连接）
const subscriber = new Redis(process.env.REDIS_URL);

subscriber.subscribe('notifications:user:*');

subscriber.on('message', (channel, message) => {
  const data = JSON.parse(message);
  console.log(`Received on ${channel}:`, data);
  // 通过 WebSocket 推送给客户端
});

// Pattern 订阅
subscriber.psubscribe('notifications:*');
subscriber.on('pmessage', (pattern, channel, message) => {
  // pattern = 'notifications:*'
  // channel = 'notifications:user:123'
});
```

---

## 6. Rate Limiting

```typescript
// 滑动窗口实现
async function checkRateLimit(
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

// 固定窗口（更简单，性能更好）
async function fixedWindowRateLimit(key: string, limit: number, windowSeconds: number) {
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, windowSeconds);
  }
  return { allowed: current <= limit, remaining: Math.max(0, limit - current) };
}
```

---

## 7. 会话管理

```typescript
import { randomUUID } from 'crypto';

interface SessionData {
  userId: string;
  roles: string[];
  createdAt: number;
  lastActive: number;
}

async function createSession(userId: string, roles: string[]): Promise<string> {
  const sessionId = randomUUID();
  const sessionData: SessionData = {
    userId,
    roles,
    createdAt: Date.now(),
    lastActive: Date.now(),
  };

  // 使用 Hash 存储（方便部分更新）
  await redis.hset(`session:${sessionId}`, {
    ...sessionData,
    roles: JSON.stringify(roles),
    createdAt: String(sessionData.createdAt),
    lastActive: String(sessionData.lastActive),
  });
  await redis.expire(`session:${sessionId}`, 86400); // 24h

  // 记录用户的所有会话（支持"退出所有设备"）
  await redis.sadd(`user:${userId}:sessions`, sessionId);

  return sessionId;
}

async function getSession(sessionId: string): Promise<SessionData | null> {
  const data = await redis.hgetall(`session:${sessionId}`);
  if (!data || !data.userId) return null;

  // 续期（滑动过期）
  await redis.expire(`session:${sessionId}`, 86400);
  await redis.hset(`session:${sessionId}`, 'lastActive', String(Date.now()));

  return {
    userId: data.userId,
    roles: JSON.parse(data.roles),
    createdAt: Number(data.createdAt),
    lastActive: Date.now(),
  };
}

async function destroySession(sessionId: string): Promise<void> {
  const data = await redis.hgetall(`session:${sessionId}`);
  if (data?.userId) {
    await redis.srem(`user:${data.userId}:sessions`, sessionId);
  }
  await redis.del(`session:${sessionId}`);
}

// 退出所有设备
async function destroyAllSessions(userId: string): Promise<void> {
  const sessions = await redis.smembers(`user:${userId}:sessions`);
  if (sessions.length > 0) {
    const pipeline = redis.pipeline();
    for (const sid of sessions) {
      pipeline.del(`session:${sid}`);
    }
    pipeline.del(`user:${userId}:sessions`);
    await pipeline.exec();
  }
}
```

---

## 8. 排行榜

```typescript
// Sorted Set 实现排行榜
async function updateScore(userId: string, score: number) {
  await redis.zadd('leaderboard', score, userId);
}

async function incrementScore(userId: string, delta: number) {
  return redis.zincrby('leaderboard', delta, userId);
}

async function getTopN(n: number): Promise<Array<{ userId: string; score: number; rank: number }>> {
  const results = await redis.zrevrange('leaderboard', 0, n - 1, 'WITHSCORES');

  const leaderboard: Array<{ userId: string; score: number; rank: number }> = [];
  for (let i = 0; i < results.length; i += 2) {
    leaderboard.push({
      userId: results[i],
      score: parseFloat(results[i + 1]),
      rank: i / 2 + 1,
    });
  }
  return leaderboard;
}

async function getUserRank(userId: string): Promise<{ rank: number; score: number } | null> {
  const [rank, score] = await Promise.all([
    redis.zrevrank('leaderboard', userId),
    redis.zscore('leaderboard', userId),
  ]);
  if (rank === null || score === null) return null;
  return { rank: rank + 1, score: parseFloat(score) };
}

// 周排行榜（每周重建）
async function resetWeeklyLeaderboard() {
  const currentWeek = `leaderboard:week:${getWeekNumber()}`;
  const prevWeek = `leaderboard:week:${getWeekNumber() - 1}`;
  await redis.rename(currentWeek, prevWeek);
  await redis.expire(prevWeek, 7 * 86400);
}
```

---

## 9. 地理位置（GEO）

```typescript
// 添加地理位置
await redis.geoadd('stores', 116.397128, 39.916527, 'store:1'); // 经度, 纬度, member
await redis.geoadd('stores', 121.473701, 31.230416, 'store:2');

// 查询两点距离
const distance = await redis.geodist('stores', 'store:1', 'store:2', 'km');

// 查找附近的店铺（半径搜索）
const nearby = await redis.georadius(
  'stores',
  116.397128, 39.916527, // 中心点
  10, 'km',              // 半径
  'WITHCOORD', 'WITHDIST', 'COUNT', 20, 'ASC'
);

// GEOSEARCH（Redis 6.2+，推荐）
const results = await redis.call(
  'GEOSEARCH', 'stores',
  'FROMLONLAT', 116.397128, 39.916527,
  'BYRADIUS', 10, 'km',
  'COUNT', 20,
  'ASC',
  'WITHCOORD', 'WITHDIST'
);
```

---

## 10. 集群与哨兵

### Sentinel（哨兵，高可用）

```typescript
const redis = new Redis({
  sentinels: [
    { host: 'sentinel1', port: 26379 },
    { host: 'sentinel2', port: 26379 },
    { host: 'sentinel3', port: 26379 },
  ],
  name: 'mymaster', // master name
  password: process.env.REDIS_PASSWORD,
  sentinelPassword: process.env.SENTINEL_PASSWORD,
});
```

### Cluster（集群，水平扩展）

```typescript
const cluster = new Redis.Cluster(
  [
    { host: 'node1', port: 6379 },
    { host: 'node2', port: 6379 },
    { host: 'node3', port: 6379 },
  ],
  {
    redisOptions: { password: process.env.REDIS_PASSWORD },
    scaleReads: 'slave', // 从节点读取
    enableReadyCheck: true,
    maxRedirections: 3,
  }
);

// Hash Tag（确保相关 key 在同一 slot）
await cluster.set('{user:1}:profile', '...');
await cluster.set('{user:1}:sessions', '...');
// {user:1} 保证这两个 key 在同一节点
```

---

## 11. 内存优化

| 策略 | 说明 | 效果 |
|------|------|------|
| `maxmemory` | 设置内存上限 | 防止 OOM |
| `maxmemory-policy` | 淘汰策略 | `allkeys-lru`（缓存）/ `noeviction`（持久化）|
| Hash 替代多 String | 内部 ziplist 编码更省内存 | 节省 30-70% |
| 短 key 名 | `u:1:p` vs `user:1:profile` | 高 key 量时显著节省 |
| 压缩大 value | gzip 压缩 JSON | 减少 50-80% |
| 合理 TTL | 避免 key 无限增长 | 控制内存 |
| `OBJECT ENCODING` | 检查数据编码 | 优化数据结构选择 |

```typescript
// 检查内存使用
// INFO memory
// MEMORY USAGE key

// 监控大 key
// redis-cli --bigkeys

// 压缩大 value
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

async function setCompressed(key: string, value: unknown, ttl: number) {
  const json = JSON.stringify(value);
  if (json.length > 1024) { // 大于 1KB 才压缩
    const compressed = await gzipAsync(json);
    await redis.setex(`gz:${key}`, ttl, compressed.toString('base64'));
  } else {
    await redis.setex(key, ttl, json);
  }
}

async function getCompressed<T>(key: string): Promise<T | null> {
  let data = await redis.get(`gz:${key}`);
  if (data) {
    const decompressed = await gunzipAsync(Buffer.from(data, 'base64'));
    return JSON.parse(decompressed.toString()) as T;
  }
  data = await redis.get(key);
  return data ? JSON.parse(data) as T : null;
}
```

---

## 12. Node.js 集成（ioredis）

```typescript
import Redis from 'ioredis';

// ── 单实例 ────────────────────────────────────────────────
const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379'),
  password: process.env.REDIS_PASSWORD,
  db: 0,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 100, 3000),
  lazyConnect: true,
  enableReadyCheck: true,
  connectTimeout: 10000,
});

// 连接事件
redis.on('connect', () => console.log('Redis connected'));
redis.on('error', (err) => console.error('Redis error:', err));
redis.on('close', () => console.log('Redis connection closed'));

// ── Pipeline（批量操作）─────────────────────────────────
const pipeline = redis.pipeline();
pipeline.get('key1');
pipeline.get('key2');
pipeline.set('key3', 'value');
const results = await pipeline.exec();

// ── Lua 脚本（原子操作）─────────────────────────────────
const compareAndSet = `
  local current = redis.call('get', KEYS[1])
  if current == ARGV[1] then
    redis.call('set', KEYS[1], ARGV[2])
    return 1
  end
  return 0
`;

const changed = await redis.eval(compareAndSet, 1, 'mykey', 'oldValue', 'newValue');

// ── 优雅关闭 ──────────────────────────────────────────────
process.on('SIGTERM', async () => {
  await redis.quit();
  process.exit(0);
});
```
