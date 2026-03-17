# React 编码风格

> 此文件扩展 [common/coding-style.md](../common/coding-style.md)，添加 React + TypeScript 特定内容。

## 函数组件优先

```typescript
// ❌ BAD: Class 组件
class UserProfile extends React.Component { ... }

// ✅ GOOD: 函数组件 + Hooks
interface UserProfileProps {
  userId: string;
  onEdit?: () => void;
}

export function UserProfile({ userId, onEdit }: UserProfileProps) {
  // ...
}
```

## 项目文件结构

```
src/
├── components/           # 共享 UI 组件（与业务无关）
│   └── Button/
│       ├── Button.tsx
│       ├── Button.test.tsx
│       └── index.ts
├── features/             # 业务功能模块
│   └── auth/
│       ├── components/   # 功能专属组件
│       ├── hooks/        # 功能专属 hooks
│       ├── utils/        # 功能专属工具
│       ├── types.ts      # 功能类型定义
│       └── index.ts      # 公开导出
├── hooks/                # 全局共享 hooks
├── utils/                # 全局工具函数
├── types/                # 全局类型定义
├── config/               # 配置文件
└── App.tsx
```

## 命名规范

| 类型 | 风格 | 示例 |
|------|------|------|
| 组件文件 | PascalCase | `UserProfile.tsx` |
| Hook 文件 | camelCase + use 前缀 | `useAuth.ts` |
| 工具文件 | camelCase | `formatDate.ts` |
| 类型文件 | camelCase / PascalCase | `types.ts` |
| 常量 | UPPER_SNAKE_CASE | `MAX_PAGE_SIZE` |
| Props 接口 | 组件名 + Props | `UserProfileProps` |
| Context | 名称 + Context | `AuthContext` |

## Props 设计

```typescript
// ✅ GOOD: 清晰的 Props 接口
interface UserCardProps {
  // 必填 props 在前
  user: User;
  onSelect: (userId: string) => void;
  // 可选 props 在后
  variant?: 'compact' | 'detailed';
  className?: string;
}

// ✅ GOOD: 使用 children
interface LayoutProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
}

// ❌ BAD: 使用 React.FC
const UserCard: React.FC<Props> = ({ ... }) => { ... };

// ✅ GOOD: 普通函数声明
export function UserCard({ user, onSelect, variant = 'compact' }: UserCardProps) {
  return (/* ... */);
}
```

## TypeScript 严格模式

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true
  }
}
```

## 组件设计原则

### 单一职责

```typescript
// ❌ BAD: 组件做太多事
function UserPage() {
  // 数据获取 + 表单处理 + 列表渲染 + 分页 = 500 行
}

// ✅ GOOD: 拆分为小组件
function UserPage() {
  return (
    <div>
      <UserSearchForm onSearch={handleSearch} />
      <UserList users={users} />
      <Pagination page={page} total={total} onChange={setPage} />
    </div>
  );
}
```

### 受控组件优先

```typescript
// ✅ GOOD: 受控组件
interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchInput({ value, onChange }: SearchInputProps) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="搜索..."
    />
  );
}
```

## 组件大小限制

- **组件函数**: < 100 行（含 JSX）
- **自定义 Hook**: < 80 行
- **工具函数**: < 50 行
- 超出时拆分为子组件或自定义 Hook
