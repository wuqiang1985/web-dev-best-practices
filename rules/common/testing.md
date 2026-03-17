# 测试规范

> 团队测试标准，强制 TDD 流程和最低覆盖率要求。

## 最低测试覆盖率：80%

## 测试类型（全部必需）

| 类型 | 覆盖范围 | 工具 |
|------|----------|------|
| 单元测试 | 函数、工具、组件 | Vitest / Jest |
| 集成测试 | API 端点、数据库操作 | Vitest + Supertest |
| E2E 测试 | 关键用户流程 | Playwright |

## TDD 流程（MANDATORY）

```
1. RED    — 写测试，运行，确认失败 ❌
2. GREEN  — 写最少的代码让测试通过 ✅
3. REFACTOR — 优化代码，测试保持绿色 ✅
4. REPEAT — 下一个测试用例
```

### 每一步都要运行测试

```bash
# 1. RED: 写完测试后立即运行
npm test -- --run src/utils/validate.test.ts
# 应该 FAIL

# 2. GREEN: 写完实现后运行
npm test -- --run src/utils/validate.test.ts
# 应该 PASS

# 3. REFACTOR: 重构后运行
npm test -- --run src/utils/validate.test.ts
# 应该仍然 PASS
```

## 测试命名规范

```typescript
describe('UserService', () => {
  describe('createUser', () => {
    it('should create a new user with valid input', () => { /* ... */ });
    it('should throw ValidationError when email is invalid', () => { /* ... */ });
    it('should throw ConflictError when email already exists', () => { /* ... */ });
  });
});
```

规则：
- `describe`: 被测模块/函数名
- `it/test`: "should + 预期行为"
- 描述行为而非实现细节

## Mock 原则

```typescript
// ✅ GOOD: 只 mock 外部依赖
vi.mock('./database', () => ({
  query: vi.fn(),
}));

// ❌ BAD: mock 被测模块的内部函数
// 这会让测试脆弱且无意义
```

### 何时 Mock

- ✅ 外部 API 调用
- ✅ 数据库连接
- ✅ 文件系统操作
- ✅ 定时器（Date.now, setTimeout）
- ❌ 被测函数的内部逻辑
- ❌ 纯函数（直接测试）

## 测试隔离

```typescript
// ✅ GOOD: 每个测试独立
beforeEach(() => {
  // 重置状态
  vi.clearAllMocks();
});

afterEach(() => {
  // 清理副作用
  cleanup();
});

// ❌ BAD: 测试之间共享状态
let sharedUser; // 一个测试修改，另一个依赖
```

## 测试数据

```typescript
// ✅ GOOD: 使用工厂函数
function createMockUser(overrides?: Partial<User>): User {
  return {
    id: 'user_123',
    name: 'Test User',
    email: 'test@example.com',
    role: 'user',
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
}

// 使用
const admin = createMockUser({ role: 'admin' });
const inactive = createMockUser({ status: 'inactive' });
```

## 覆盖率报告

```bash
# 生成覆盖率报告
npm test -- --coverage

# 覆盖率门槛配置（vitest.config.ts）
# coverage: {
#   thresholds: {
#     statements: 80,
#     branches: 80,
#     functions: 80,
#     lines: 80,
#   }
# }
```

## 排查测试失败

1. 使用 `/tdd` 命令获取引导
2. 检查测试隔离（是否有共享状态）
3. 验证 mock 是否正确
4. **修改实现而非测试**（除非测试本身有误）
