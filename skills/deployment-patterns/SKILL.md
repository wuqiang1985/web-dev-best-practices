---
name: deployment-patterns
description: 部署策略深度参考，涵盖 CI/CD 流水线设计（GitHub Actions）、蓝绿部署、金丝雀发布、滚动更新、环境管理、健康检查与就绪探针、回滚策略、数据库零停机迁移、静态资源 CDN 部署、监控告警（Prometheus/Grafana）、日志聚合、密钥管理。
origin: web-dev-best-practices
---

# 部署策略

Web 应用的 CI/CD 流水线设计与部署最佳实践深度参考。

## When to Activate

- 设计 CI/CD 流水线（GitHub Actions）
- 选择部署策略（蓝绿、金丝雀、滚动更新）
- 配置环境管理（dev/staging/production）
- 实现健康检查与就绪探针
- 设计回滚策略
- 执行数据库零停机迁移
- 部署静态资源到 CDN
- 配置监控与告警
- 配置日志聚合
- 管理密钥（环境变量、Vault、KMS）

---

## 1. CI/CD 流水线（GitHub Actions）

### 1.1 完整 CI 流水线

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: '20'
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  # ── Lint & Type Check ──────────────────────────────────
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  # ── Unit & Integration Tests ───────────────────────────
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npm test -- --coverage
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test
          REDIS_URL: redis://localhost:6379
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-report
          path: coverage/
          retention-days: 7

  # ── E2E Tests ──────────────────────────────────────────
  e2e:
    runs-on: ubuntu-latest
    needs: [lint, test]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7

  # ── Build Docker Image ─────────────────────────────────
  build:
    runs-on: ubuntu-latest
    needs: [lint, test]
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=sha,prefix=
            type=ref,event=branch
            type=semver,pattern={{version}}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ── Deploy to Staging ──────────────────────────────────
  deploy-staging:
    runs-on: ubuntu-latest
    needs: [build, e2e]
    if: github.ref == 'refs/heads/develop'
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to staging
        run: |
          echo "Deploying to staging..."
          # kubectl set image deployment/myapp myapp=$REGISTRY/$IMAGE_NAME:$GITHUB_SHA
          # 或使用云平台 CLI

  # ── Deploy to Production ───────────────────────────────
  deploy-production:
    runs-on: ubuntu-latest
    needs: [build, e2e]
    if: github.ref == 'refs/heads/main'
    environment: production
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to production
        run: |
          echo "Deploying to production..."

      - name: Notify deployment
        if: success()
        uses: slackapi/slack-github-action@v1.26.0
        with:
          payload: |
            {
              "text": "Deployed ${{ github.sha }} to production"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### 1.2 PR 检查工作流

```yaml
# .github/workflows/pr-check.yml
name: PR Check

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  size-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci && npm run build
      - name: Check bundle size
        uses: andresz1/size-limit-action@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}

  dependency-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Dependency Review
        uses: actions/dependency-review-action@v4
        with:
          fail-on-severity: high
```

### 1.3 Release 工作流

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write
  packages: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Generate changelog
        id: changelog
        run: |
          PREV_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")
          if [ -n "$PREV_TAG" ]; then
            CHANGELOG=$(git log $PREV_TAG..HEAD --pretty=format:"- %s (%h)" --no-merges)
          else
            CHANGELOG=$(git log --pretty=format:"- %s (%h)" --no-merges)
          fi
          echo "changelog<<EOF" >> $GITHUB_OUTPUT
          echo "$CHANGELOG" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          body: |
            ## Changes
            ${{ steps.changelog.outputs.changelog }}
          generate_release_notes: true
```

---

## 2. 部署策略

### 2.1 蓝绿部署

两套完全相同的环境，切换流量实现零停机部署：

```
            ┌──────────────────┐
            │   Load Balancer  │
            └────────┬─────────┘
                     │
           ┌─────────┴─────────┐
           │                   │
      ┌────▼─────┐       ┌────▼─────┐
      │  Blue    │       │  Green   │
      │ (当前)   │       │ (新版本)  │
      │  v1.0    │       │  v1.1    │
      └──────────┘       └──────────┘
```

流程：
1. Green 环境部署新版本
2. 在 Green 上运行 smoke test
3. 通过 Load Balancer 切换全部流量到 Green
4. 保留 Blue 作为快速回滚方案
5. 验证稳定后，Blue 可更新为 v1.1 备用

优点：零停机、快速回滚（秒级）
缺点：需要两倍基础设施资源

### 2.2 金丝雀发布

逐步将流量引向新版本，根据监控指标决定是否继续：

```
请求流量 ─── 95% ──→ 稳定版本 (v1.0)
           │
           └── 5% ──→ 金丝雀版本 (v1.1)
```

流程：
1. 部署新版本到金丝雀节点
2. 导入 5% 流量到金丝雀
3. 监控关键指标（错误率、P99 延迟、业务指标）
4. 如果指标正常，逐步增加流量：5% → 25% → 50% → 100%
5. 如果异常，立即回滚到 0%

```yaml
# Kubernetes 金丝雀示例
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: myapp
spec:
  hosts:
    - myapp.example.com
  http:
    - route:
        - destination:
            host: myapp-stable
            port:
              number: 80
          weight: 95
        - destination:
            host: myapp-canary
            port:
              number: 80
          weight: 5
```

### 2.3 滚动更新

逐步替换旧实例为新实例，Kubernetes 默认策略：

```yaml
# Kubernetes 滚动更新配置
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  replicas: 4
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1          # 最多多出 1 个 Pod
      maxUnavailable: 0    # 不允许不可用（零停机）
  template:
    spec:
      containers:
        - name: myapp
          image: myapp:v1.1
          readinessProbe:
            httpGet:
              path: /ready
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
```

---

## 3. 环境管理

| 环境 | 用途 | 数据 | 部署触发 | 审批 |
|------|------|------|---------|------|
| dev | 本地开发 | seed 数据 | docker-compose | 无 |
| staging | 测试验证 | 生产数据脱敏 | develop 分支推送 | 无 |
| production | 线上服务 | 真实数据 | main 分支 / tag | 需要审批 |

### 环境变量分层

```
.env.example          # 模板（提交到 Git）
.env.development      # 本地开发配置
.env.test             # 测试环境配置
.env.staging          # Staging 配置
.env.production       # 生产配置（不在 Git 中，通过 CI/CD Secret 注入）
```

```typescript
// config.ts — 环境变量验证（启动时 fail fast）
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  CORS_ORIGINS: z.string().transform(s => s.split(',')),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export const env = envSchema.parse(process.env);
```

---

## 4. 健康检查与就绪探针

```typescript
interface HealthCheck {
  name: string;
  check: () => Promise<boolean>;
}

const healthChecks: HealthCheck[] = [
  {
    name: 'database',
    check: async () => {
      await pool.query('SELECT 1');
      return true;
    },
  },
  {
    name: 'redis',
    check: async () => {
      const result = await redis.ping();
      return result === 'PONG';
    },
  },
  {
    name: 'memory',
    check: async () => {
      const used = process.memoryUsage();
      return used.heapUsed / used.heapTotal < 0.9; // < 90%
    },
  },
];

// /health — 存活探针（不检查外部依赖）
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.APP_VERSION ?? 'unknown',
    commit: process.env.GIT_SHA ?? 'unknown',
  });
});

// /ready — 就绪探针（检查所有依赖）
app.get('/ready', async (_req, res) => {
  const results = await Promise.allSettled(
    healthChecks.map(async hc => ({
      name: hc.name,
      healthy: await hc.check().catch(() => false),
    }))
  );

  const checks = results.map(r =>
    r.status === 'fulfilled' ? r.value : { name: 'unknown', healthy: false }
  );

  const allHealthy = checks.every(c => c.healthy);

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'ready' : 'degraded',
    checks: Object.fromEntries(checks.map(c => [c.name, c.healthy])),
  });
});
```

---

## 5. 回滚策略

### 应用回滚

```bash
# 方式 1：重新部署上一个版本的镜像（最快）
kubectl rollout undo deployment/myapp
# 或指定版本
kubectl rollout undo deployment/myapp --to-revision=3

# Docker Swarm
docker service update --image myapp:v1.0 myapp

# 方式 2：Git revert + 重新部署（有审计记录）
git revert HEAD --no-edit
git push origin main
# CI/CD 自动部署 revert 后的版本
```

### 自动回滚

```yaml
# Kubernetes — 自动回滚失败的部署
apiVersion: apps/v1
kind: Deployment
spec:
  progressDeadlineSeconds: 600  # 10 分钟内未完成则标记失败
  minReadySeconds: 30           # Pod 就绪后至少等 30 秒
```

```yaml
# GitHub Actions — 部署后验证
- name: Deploy
  run: deploy.sh

- name: Verify deployment
  run: |
    for i in {1..10}; do
      STATUS=$(curl -s -o /dev/null -w '%{http_code}' https://api.example.com/health)
      if [ "$STATUS" = "200" ]; then
        echo "Deployment healthy"
        exit 0
      fi
      sleep 10
    done
    echo "Deployment unhealthy, triggering rollback"
    kubectl rollout undo deployment/myapp
    exit 1
```

---

## 6. 数据库迁移部署（零停机）

### 安全迁移流程

```
阶段 1：向后兼容的 schema 变更
  ✅ ADD COLUMN (nullable 或带默认值)
  ✅ CREATE INDEX CONCURRENTLY
  ✅ ADD TABLE
  ❌ DROP COLUMN（代码仍在使用）
  ❌ RENAME COLUMN
  ❌ ALTER COLUMN ... NOT NULL（大表会锁表）

阶段 2：部署新代码
  - 新代码读写新列，但兼容旧 schema
  - 旧代码不受影响

阶段 3：数据回填（如需）
  - 批量更新，避免长时间锁表
  - 使用 LIMIT + OFFSET 分批处理

阶段 4：清理（下一次部署）
  - 确认旧列不再使用后 DROP COLUMN
  - 删除兼容代码
```

### 示例：添加新列

```sql
-- 迁移 001：添加列（阶段 1）
ALTER TABLE users ADD COLUMN display_name TEXT;
-- nullable，不会锁表

-- 迁移 002：创建索引（阶段 1）
CREATE INDEX CONCURRENTLY idx_users_display_name ON users (display_name);
-- CONCURRENTLY 不会阻塞写入

-- 应用代码（阶段 2）：
-- 读取时 COALESCE(display_name, name)
-- 写入时同时写 display_name 和 name

-- 迁移 003：回填数据（阶段 3）
DO $$
DECLARE
  batch_size INT := 1000;
  updated INT;
BEGIN
  LOOP
    UPDATE users
    SET display_name = name
    WHERE id IN (
      SELECT id FROM users
      WHERE display_name IS NULL
      LIMIT batch_size
      FOR UPDATE SKIP LOCKED
    );
    GET DIAGNOSTICS updated = ROW_COUNT;
    EXIT WHEN updated = 0;
    PERFORM pg_sleep(0.1); -- 避免过载
  END LOOP;
END $$;

-- 迁移 004：添加约束（阶段 4，下一次部署）
ALTER TABLE users ALTER COLUMN display_name SET NOT NULL;
ALTER TABLE users ALTER COLUMN display_name SET DEFAULT '';
```

### 危险操作清单

```bash
# CI 中检查迁移文件，拒绝危险操作：
# ❌ DROP COLUMN — 先确认代码不再使用
# ❌ ALTER COLUMN SET NOT NULL — 大表会全表扫描 + 锁表
# ❌ ALTER COLUMN TYPE — 需要重写整列
# ❌ RENAME COLUMN — 代码必须同步更新
# ❌ CREATE INDEX（无 CONCURRENTLY）— 锁表
# ❌ ALTER TABLE ... ADD CONSTRAINT ... NOT VALID — 锁表
```

---

## 7. 静态资源部署

```bash
# ── CDN 部署策略 ──────────────────────────────────────────

# 1. 构建时生成带 hash 的文件名
# main.abc123.js, styles.def456.css

# 2. 先上传新版本静态资源到 CDN
aws s3 sync dist/ s3://my-bucket/assets/ \
  --cache-control "public, max-age=31536000, immutable"

# 3. 再更新 index.html（引用新的 hash 文件名）
aws s3 cp dist/index.html s3://my-bucket/index.html \
  --cache-control "no-cache"

# 4. 清除 CDN 缓存（仅 index.html）
aws cloudfront create-invalidation \
  --distribution-id $CF_DIST_ID \
  --paths "/index.html"
```

缓存策略：

| 资源类型 | Cache-Control | 说明 |
|---------|--------------|------|
| `index.html` | `no-cache` | 每次请求验证（获取最新入口） |
| `*.js`, `*.css` (hashed) | `public, max-age=31536000, immutable` | 永久缓存 |
| 图片/字体 (hashed) | `public, max-age=31536000, immutable` | 永久缓存 |
| API 响应 | `no-store` 或短 TTL | 不缓存或短期缓存 |

---

## 8. 监控与告警

### 核心指标（Golden Signals）

| 类型 | 指标 | 告警阈值 | 说明 |
|------|------|---------|------|
| 延迟 | P50/P95/P99 响应时间 | P99 > 2s | 用户体验 |
| 流量 | QPS | 环比异常 > 200% | 容量规划 |
| 错误 | 5xx 错误率 | > 1% | 服务可用性 |
| 饱和度 | CPU 使用率 | > 80% | 资源不足 |
| 饱和度 | 内存使用率 | > 85% | OOM 风险 |
| 数据库 | 慢查询数 | > 10/min | 查询优化 |
| 数据库 | 连接池使用率 | > 80% | 连接泄漏 |
| 缓存 | Redis 命中率 | < 80% | 缓存策略 |
| 缓存 | Redis 内存 | > 80% | 内存溢出 |

### Prometheus 指标暴露

```typescript
import { collectDefaultMetrics, Counter, Histogram, register } from 'prom-client';

// 收集默认指标（CPU、内存、事件循环等）
collectDefaultMetrics();

// 自定义指标
const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

// 中间件
app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const labels = {
      method: req.method,
      route: req.route?.path ?? req.path,
      status_code: res.statusCode,
    };
    end(labels);
    httpRequestTotal.inc(labels);
  });
  next();
});

// Metrics 端点
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

### 告警规则示例（Prometheus AlertManager）

```yaml
groups:
  - name: app-alerts
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status_code=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.01
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High 5xx error rate ({{ $value | humanizePercentage }})"

      - alert: HighLatency
        expr: histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "P99 latency above 2 seconds"

      - alert: HighCPU
        expr: process_cpu_seconds_total > 0.8
        for: 10m
        labels:
          severity: warning
```

---

## 9. 日志聚合

### 结构化日志

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level(label) { return { level: label }; },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // 生产环境输出 JSON 到 stdout
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

// 请求日志中间件
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] ?? crypto.randomUUID();
  req.log = logger.child({ requestId, method: req.method, url: req.url });

  const start = Date.now();
  res.on('finish', () => {
    req.log.info({
      statusCode: res.statusCode,
      duration: Date.now() - start,
      contentLength: res.get('content-length'),
    }, 'Request completed');
  });

  next();
});
```

日志聚合架构：

```
应用 → stdout/stderr → Docker log driver → Fluentd/Logstash → Elasticsearch → Kibana
                                          → CloudWatch Logs → CloudWatch Insights
                                          → Loki → Grafana
```

---

## 10. 密钥管理

```bash
# ✅ 方式 1：CI/CD 环境变量（最简单）
# GitHub Actions → Settings → Secrets and variables → Actions

# ✅ 方式 2：密钥管理服务（推荐生产环境）
# AWS Secrets Manager
aws secretsmanager get-secret-value --secret-id myapp/production

# HashiCorp Vault
vault kv get secret/myapp/production

# Doppler
doppler secrets download --no-file

# ✅ 方式 3：Kubernetes Secrets + External Secrets Operator
# 从 AWS/GCP/Azure 密钥管理服务同步到 K8s Secrets

# ❌ NEVER：提交到 Git
# ❌ NEVER：硬编码到 Docker 镜像
# ❌ NEVER：通过即时通讯工具传递
# ❌ NEVER：存储在 .env.production 文件中（在服务器上）
```

### Secret Rotation

```typescript
// 定期轮换密钥的模式
class SecretManager {
  private cache = new Map<string, { value: string; expiresAt: number }>();

  async getSecret(name: string): Promise<string> {
    const cached = this.cache.get(name);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.value;
    }

    // 从密钥管理服务获取
    const value = await this.fetchFromVault(name);
    this.cache.set(name, {
      value,
      expiresAt: Date.now() + 5 * 60 * 1000, // 缓存 5 分钟
    });

    return value;
  }

  private async fetchFromVault(name: string): Promise<string> {
    // AWS Secrets Manager / Vault / etc.
    const response = await fetch(`${VAULT_URL}/v1/secret/data/${name}`, {
      headers: { 'X-Vault-Token': VAULT_TOKEN },
    });
    const data = await response.json();
    return data.data.data.value;
  }
}
```

### GitHub Actions Secret 注入

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Deploy
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          JWT_SECRET: ${{ secrets.JWT_SECRET }}
          REDIS_URL: ${{ secrets.REDIS_URL }}
        run: |
          # 密钥通过环境变量传递，不会出现在日志中
          echo "Deploying with secrets..."
```
