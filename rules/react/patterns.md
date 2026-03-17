# React 设计模式

> 此文件扩展 [common/patterns.md](../common/patterns.md)，添加 React 特定模式。

## 状态管理选择指南

| 场景 | 方案 | 工具 |
|------|------|------|
| 组件局部状态 | 本地状态 | `useState` / `useReducer` |
| 跨组件共享 | 全局状态 | Zustand（推荐）/ Redux Toolkit |
| 服务端数据 | 服务端状态 | TanStack Query（推荐） |
| URL 参数 | URL 状态 | `useSearchParams` |
| 主题/语言 | 静态全局 | React Context |

### Zustand Store 模式

```typescript
import { create } from 'zustand';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (credentials: Credentials) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  login: async (credentials) => {
    const user = await authApi.login(credentials);
    set({ user, isAuthenticated: true });
  },
  logout: () => set({ user: null, isAuthenticated: false }),
}));
```

## 数据获取模式

### TanStack Query

```typescript
// 查询
function useUsers(filters: UserFilters) {
  return useQuery({
    queryKey: ['users', filters],
    queryFn: () => fetchUsers(filters),
    staleTime: 5 * 60 * 1000,  // 5 分钟内不重新请求
  });
}

// 变更 + 乐观更新
function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateUser,
    onMutate: async (updatedUser) => {
      await queryClient.cancelQueries({ queryKey: ['users'] });
      const previous = queryClient.getQueryData(['users']);
      queryClient.setQueryData(['users'], (old: User[]) =>
        old.map((u) => (u.id === updatedUser.id ? { ...u, ...updatedUser } : u))
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(['users'], context?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
```

### Loading / Error / Empty 三态

```typescript
function UserList() {
  const { data, isLoading, error } = useUsers();

  if (isLoading) return <Skeleton count={5} />;
  if (error) return <ErrorMessage error={error} />;
  if (!data?.length) return <EmptyState message="暂无用户" />;

  return (
    <ul>
      {data.map((user) => (
        <UserCard key={user.id} user={user} />
      ))}
    </ul>
  );
}
```

## 表单处理

### React Hook Form + Zod

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(8, '密码至少 8 位'),
});

type FormData = z.infer<typeof schema>;

function LoginForm({ onSubmit }: { onSubmit: (data: FormData) => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('email')} />
      {errors.email && <span>{errors.email.message}</span>}

      <input type="password" {...register('password')} />
      {errors.password && <span>{errors.password.message}</span>}

      <button type="submit">登录</button>
    </form>
  );
}
```

## 组合模式

### Compound Components

```typescript
interface TabsContextValue {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const TabsContext = createContext<TabsContextValue | undefined>(undefined);

function Tabs({ children, defaultTab }: { children: React.ReactNode; defaultTab: string }) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      {children}
    </TabsContext.Provider>
  );
}

function TabList({ children }: { children: React.ReactNode }) {
  return <div role="tablist">{children}</div>;
}

function Tab({ value, children }: { value: string; children: React.ReactNode }) {
  const { activeTab, setActiveTab } = useContext(TabsContext)!;
  return (
    <button role="tab" aria-selected={activeTab === value} onClick={() => setActiveTab(value)}>
      {children}
    </button>
  );
}

// 使用
<Tabs defaultTab="profile">
  <TabList>
    <Tab value="profile">个人信息</Tab>
    <Tab value="settings">设置</Tab>
  </TabList>
  <TabPanel value="profile">...</TabPanel>
</Tabs>
```

### 自定义 Hook 抽象

```typescript
// 将复杂逻辑提取到 hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
```

## 错误处理

### Error Boundary

```typescript
import { ErrorBoundary } from 'react-error-boundary';

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div role="alert">
      <h2>出现了错误</h2>
      <p>{error.message}</p>
      <button onClick={resetErrorBoundary}>重试</button>
    </div>
  );
}

// 使用
<ErrorBoundary FallbackComponent={ErrorFallback}>
  <UserDashboard />
</ErrorBoundary>
```

## 性能优化

```typescript
// 1. React.memo — 避免不必要的重渲染
const UserCard = memo(function UserCard({ user }: { user: User }) {
  return <div>{user.name}</div>;
});

// 2. useMemo — 缓存计算结果
const sortedUsers = useMemo(
  () => users.toSorted((a, b) => a.name.localeCompare(b.name)),
  [users]
);

// 3. useCallback — 缓存函数引用
const handleSelect = useCallback((id: string) => {
  setSelectedId(id);
}, []);

// 4. 代码分割 — 按路由懒加载
const Dashboard = lazy(() => import('./pages/Dashboard'));
```
