# 编码风格规范

> 通用编码风格规范，适用于所有语言和框架。

## 命名约定

| 类型 | 风格 | 示例 |
|------|------|------|
| 变量 / 函数 | camelCase | `getUserName`, `isActive` |
| 类 / 接口 / 类型 | PascalCase | `UserProfile`, `ApiResponse` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT`, `API_BASE_URL` |
| 文件（组件） | PascalCase | `UserProfile.tsx` |
| 文件（工具） | camelCase | `formatDate.ts` |
| 数据库表/列 | snake_case | `user_profiles`, `created_at` |
| URL 路径 | kebab-case | `/api/user-profiles` |

### 命名原则

- **变量名表达含义**：`userCount` 而非 `n`，`isVisible` 而非 `flag`
- **函数名表达行为**：`fetchUser()` 而非 `data()`，`validateEmail()` 而非 `check()`
- **布尔变量**：使用 `is/has/can/should` 前缀 — `isLoading`, `hasPermission`
- **集合变量**：使用复数 — `users`, `orderItems`

## 文件组织

### 按功能/领域组织（推荐）

```
src/
├── features/           # 业务功能模块
│   ├── auth/
│   ├── orders/
│   └── products/
├── components/         # 共享 UI 组件
├── hooks/              # 共享 hooks
├── utils/              # 工具函数
├── types/              # 全局类型
└── config/             # 配置
```

### 文件大小

- **最佳范围**: 200–400 行
- **上限**: 800 行 — 超出则拆分
- **函数上限**: 50 行
- **嵌套上限**: 4 层

## 不可变性原则（CRITICAL）

**永远创建新对象，绝不修改原对象：**

```typescript
// ❌ BAD: 修改原对象
function updateUser(user: User, name: string) {
  user.name = name; // mutation!
  return user;
}

// ✅ GOOD: 返回新对象
function updateUser(user: User, name: string): User {
  return { ...user, name };
}

// ❌ BAD: 修改数组
function addItem(list: Item[], item: Item) {
  list.push(item); // mutation!
}

// ✅ GOOD: 返回新数组
function addItem(list: Item[], item: Item): Item[] {
  return [...list, item];
}
```

> **Language note**: 此规则可能被语言特定规则覆盖（如 Go 的指针接收器模式）。

## 错误处理

```typescript
// ❌ BAD: 吞掉错误
try {
  await fetchData();
} catch (e) {
  // 静默失败
}

// ❌ BAD: 只记录不处理
try {
  await fetchData();
} catch (e) {
  console.log(e);
}

// ✅ GOOD: 显式处理 + 有意义的日志
try {
  await fetchData();
} catch (error) {
  logger.error('Failed to fetch user data', { error, userId });
  throw new AppError('DATA_FETCH_FAILED', 'Unable to load user data');
}
```

## 输入验证

在所有系统边界处验证输入：

```typescript
// ✅ GOOD: API 端点使用 schema 验证
import { z } from 'zod';

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  age: z.number().int().min(0).max(150).optional(),
});

function createUser(input: unknown) {
  const validated = CreateUserSchema.parse(input);
  // 使用验证后的 validated...
}
```

## 代码质量清单

每次提交前检查：

- [ ] 命名清晰、有意义
- [ ] 函数小于 50 行
- [ ] 文件小于 800 行
- [ ] 嵌套不超过 4 层
- [ ] 错误被正确处理
- [ ] 无硬编码值（使用常量或配置）
- [ ] 使用不可变模式（无 mutation）
- [ ] 无 `console.log`（使用 logger）
- [ ] 无未使用的变量和导入
