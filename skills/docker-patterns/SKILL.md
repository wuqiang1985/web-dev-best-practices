---
name: docker-patterns
description: Docker 容器化深度参考，涵盖 Dockerfile 多阶段构建、层缓存优化、Docker Compose 本地开发环境、Node.js 容器化、数据库容器化、网络模式、卷管理、环境变量管理、日志管理、安全加固、常用模板。
origin: web-dev-best-practices
---

# Docker 容器化模式

Web 应用的 Docker 容器化最佳实践深度参考。

## When to Activate

- 编写 Dockerfile（多阶段构建、层缓存优化）
- 配置 Docker Compose 本地开发环境
- 容器化 Node.js 应用（基础镜像选择、.dockerignore、health check）
- 容器化数据库（PostgreSQL、Redis）
- 配置容器网络（bridge、host、overlay）
- 管理数据卷（持久化、开发热重载）
- 管理环境变量
- 配置日志
- 安全加固（non-root、只读文件系统、资源限制）

---

## 1. Dockerfile 最佳实践

### 1.1 Node.js 后端多阶段构建

```dockerfile
# ── Stage 1: Dependencies ─────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# 只复制依赖文件（利用层缓存）
COPY package.json package-lock.json ./
RUN npm ci --only=production && \
    cp -R node_modules /prod_deps && \
    npm ci

# ── Stage 2: Build ────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 构建（TypeScript 编译等）
RUN npm run build && \
    npm prune --production

# ── Stage 3: Production ──────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# 安全：创建非 root 用户
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser

# 安装 tini（PID 1 问题：正确处理信号）
RUN apk add --no-cache tini

# 只复制运行时必要文件
COPY --from=deps /prod_deps ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# 设置文件权限
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# 使用 tini 作为 PID 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
```

### 1.2 React 前端 Dockerfile

```dockerfile
# ── Stage 1: Build ────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# 构建时注入环境变量
ARG VITE_API_URL
ARG VITE_APP_VERSION
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_VERSION=$VITE_APP_VERSION

RUN npm run build

# ── Stage 2: Nginx ────────────────────────────────────────
FROM nginx:1.25-alpine AS runner

# 自定义 Nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 非 root
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### 1.3 Nginx SPA 配置

```nginx
# nginx.conf
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # SPA 路由：所有路径都返回 index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源缓存（带 hash 的文件名）
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # API 代理
    location /api/ {
        proxy_pass http://backend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
}
```

### 1.4 开发用 Dockerfile

```dockerfile
# Dockerfile.dev
FROM node:20-alpine

WORKDIR /app

# 安装开发工具
RUN apk add --no-cache git

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 3000

# 使用 nodemon 或 tsx watch 进行热重载
CMD ["npm", "run", "dev"]
```

---

## 2. 层缓存优化

```dockerfile
# ✅ GOOD: 变化少的先复制（缓存命中率高）
COPY package.json package-lock.json ./   # 变化少
RUN npm ci                                # 利用缓存
COPY tsconfig.json ./                     # 变化少
COPY src/ ./src/                          # 变化多（最后复制）
RUN npm run build

# ❌ BAD: 一次性复制所有文件
COPY . .                                  # 任何文件变化都导致所有后续层失效
RUN npm ci && npm run build

# ✅ GOOD: 合并 RUN 减少层数
RUN apk add --no-cache curl && \
    npm ci --only=production && \
    npm cache clean --force

# ❌ BAD: 多个 RUN 增加层数和大小
RUN apk add --no-cache curl
RUN npm ci --only=production
RUN npm cache clean --force
```

---

## 3. .dockerignore

```
# Dependencies
node_modules
.pnp
.pnp.js

# Build output
dist
build
coverage

# Version control
.git
.gitignore

# IDE
.vscode
.idea
*.swp
*.swo

# Environment
.env
.env.*
!.env.example

# Docker files (avoid recursive context)
Dockerfile*
docker-compose*.yml
.dockerignore

# Documentation
README.md
CHANGELOG.md
docs/

# Test
__tests__
*.test.ts
*.test.tsx
*.spec.ts
jest.config.*
vitest.config.*
playwright.config.*
tests/

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
```

---

## 4. Docker Compose 本地开发

### 4.1 完整开发环境

```yaml
# docker-compose.yml
services:
  # ── API Server ──────────────────────────────────────────
  api:
    build:
      context: .
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
      - "9229:9229"  # Node.js debugger
    volumes:
      - .:/app
      - /app/node_modules     # 排除 node_modules（使用容器内的）
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://postgres:postgres@db:5432/myapp
      REDIS_URL: redis://redis:6379
      JWT_SECRET: dev-secret-change-in-production
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  # ── PostgreSQL ──────────────────────────────────────────
  db:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_INITDB_ARGS: "--encoding=UTF-8 --lc-collate=C --lc-ctype=C"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./migrations/init.sql:/docker-entrypoint-initdb.d/01-init.sql
      - ./migrations/seed.sql:/docker-entrypoint-initdb.d/02-seed.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d myapp"]
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 10s
    restart: unless-stopped

  # ── Redis ───────────────────────────────────────────────
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  # ── Adminer（数据库管理 UI）────────────────────────────
  adminer:
    image: adminer:latest
    ports:
      - "8080:8080"
    environment:
      ADMINER_DEFAULT_SERVER: db
    depends_on:
      - db
    profiles:
      - tools  # docker compose --profile tools up

  # ── Redis Commander（Redis 管理 UI）────────────────────
  redis-commander:
    image: rediscommander/redis-commander:latest
    ports:
      - "8081:8081"
    environment:
      REDIS_HOSTS: local:redis:6379
    depends_on:
      - redis
    profiles:
      - tools

  # ── MailHog（邮件测试）─────────────────────────────────
  mailhog:
    image: mailhog/mailhog:latest
    ports:
      - "1025:1025"   # SMTP
      - "8025:8025"   # Web UI
    profiles:
      - tools

volumes:
  postgres_data:
  redis_data:
```

### 4.2 生产环境 Compose

```yaml
# docker-compose.prod.yml
services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    env_file:
      - .env.production
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
        window: 120s
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
```

---

## 5. 网络模式

```yaml
# Bridge（默认，容器间通过服务名通信）
services:
  api:
    networks:
      - backend
      - frontend
  db:
    networks:
      - backend       # 只在后端网络中，前端无法直接访问
  nginx:
    networks:
      - frontend

networks:
  backend:
    driver: bridge
  frontend:
    driver: bridge
```

```yaml
# Host（容器直接使用宿主机网络，性能最好但端口冲突）
services:
  api:
    network_mode: host
```

---

## 6. 卷管理

```yaml
services:
  api:
    volumes:
      # Bind mount（开发时代码热重载）
      - ./src:/app/src:ro            # 只读挂载源码

      # Named volume（排除 node_modules）
      - node_modules:/app/node_modules

      # 匿名卷（临时数据）
      - /app/tmp

  db:
    volumes:
      # Named volume（数据持久化）
      - postgres_data:/var/lib/postgresql/data

      # 初始化脚本
      - ./db/init:/docker-entrypoint-initdb.d:ro

volumes:
  node_modules:
  postgres_data:
    # 外部管理的卷
    # external: true
```

---

## 7. 环境变量管理

```yaml
services:
  api:
    # 方式 1：env_file（推荐）
    env_file:
      - .env                    # 默认
      - .env.${DEPLOY_ENV:-dev} # 环境特定

    # 方式 2：直接定义（覆盖 env_file 中的值）
    environment:
      NODE_ENV: production
      LOG_LEVEL: info

    # 方式 3：传递宿主机环境变量
    environment:
      DATABASE_URL: ${DATABASE_URL}  # 从宿主机环境变量注入
```

```bash
# .env.example（提交到 Git，作为模板）
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@db:5432/myapp
REDIS_URL=redis://redis:6379
JWT_SECRET=change-me-in-production
SMTP_HOST=mailhog
SMTP_PORT=1025

# .env（不提交到 Git）
# 复制 .env.example 并填入实际值
```

---

## 8. 日志管理

```yaml
services:
  api:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
        tag: "{{.Name}}"

    # 或者使用 fluentd
    # logging:
    #   driver: fluentd
    #   options:
    #     fluentd-address: localhost:24224
    #     tag: myapp.api
```

应用层结构化日志：

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty' }
    : undefined,
  // 生产环境输出 JSON 到 stdout（Docker 默认收集 stdout）
});

// 结构化日志
logger.info({ userId: '123', action: 'login' }, 'User logged in');
logger.error({ err, requestId: req.id }, 'Request failed');
```

---

## 9. 安全加固

### 9.1 Dockerfile 安全

```dockerfile
# 1. 非 root 用户（CRITICAL）
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 --ingroup appgroup appuser
USER appuser

# 2. 最小化基础镜像
FROM node:20-alpine    # ✅ ~50MB
# FROM node:20         # ❌ ~350MB（更多攻击面）
# FROM gcr.io/distroless/nodejs20  # ✅✅ 最小化（无 shell）

# 3. 不安装不必要的包
RUN apk add --no-cache --virtual .build-deps gcc musl-dev && \
    npm ci && \
    apk del .build-deps

# 4. 设置文件权限
COPY --chown=appuser:appgroup . .

# 5. 不在镜像中存储密钥
# ❌ COPY .env .
# ❌ ENV SECRET_KEY=abc123
# ✅ 运行时通过环境变量注入
```

### 9.2 运行时安全

```yaml
services:
  api:
    # 只读文件系统
    read_only: true
    tmpfs:
      - /tmp
      - /app/logs

    # 资源限制
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M

    # 安全选项
    security_opt:
      - no-new-privileges:true

    # 内核能力（删除不需要的）
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE  # 仅保留绑定端口的能力
```

### 9.3 镜像扫描

```bash
# Docker Scout（内置）
docker scout cves --only-fixed local://myapp:latest

# Trivy（开源）
trivy image myapp:latest

# Snyk
snyk container test myapp:latest
```

---

## 10. Health Check

```typescript
// src/health.ts
import { type Express } from 'express';

export function setupHealthChecks(app: Express, pool: Pool, redis: Redis) {
  // 存活探针（Liveness）— 进程是否存活
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.APP_VERSION ?? 'unknown',
    });
  });

  // 就绪探针（Readiness）— 是否可以接受流量
  app.get('/ready', async (_req, res) => {
    const checks = {
      database: false,
      redis: false,
    };

    try {
      await pool.query('SELECT 1');
      checks.database = true;
    } catch {}

    try {
      await redis.ping();
      checks.redis = true;
    } catch {}

    const allHealthy = Object.values(checks).every(Boolean);

    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'ready' : 'degraded',
      checks,
    });
  });
}
```

对应 Dockerfile：

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
```

对应 docker-compose：

```yaml
healthcheck:
  test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/health"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 30s
```

---

## 11. 常用命令速查

```bash
# 构建
docker build -t myapp:latest .
docker build -t myapp:latest --build-arg VITE_API_URL=https://api.example.com .
docker build -t myapp:latest --target runner .  # 只构建到指定 stage

# Compose
docker compose up -d                    # 启动所有服务
docker compose up -d --build             # 重新构建并启动
docker compose --profile tools up -d     # 启动含 tools profile 的服务
docker compose down                      # 停止并删除容器
docker compose down -v                   # 同时删除卷
docker compose logs -f api               # 查看日志
docker compose exec api sh               # 进入容器
docker compose ps                        # 查看状态

# 调试
docker exec -it <container> sh           # 进入运行中的容器
docker logs -f --tail 100 <container>    # 查看最近 100 行日志
docker stats                             # 资源使用统计
docker system df                         # 磁盘使用
docker system prune -a                   # 清理未使用的镜像和容器

# 镜像
docker images                            # 列出镜像
docker image inspect myapp:latest        # 检查镜像
docker history myapp:latest              # 查看构建历史（层信息）
```
