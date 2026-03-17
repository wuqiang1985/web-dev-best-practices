---
name: react-patterns
description: React 组件组合、自定义 Hooks、状态管理、性能优化、错误处理、TypeScript 泛型组件、TanStack Query 数据获取、React Hook Form 表单处理深度参考。
origin: web-dev-best-practices
---

# React 开发模式

React + TypeScript 应用的架构模式与最佳实践深度参考。

## When to Activate

- 构建 React 组件（Compound Components、Render Props、HOC）
- 编写自定义 Hooks（useDebounce、useFetch、useLocalStorage、useMediaQuery）
- 管理状态（useState 进阶、useReducer 复杂状态、Zustand store 模式）
- 优化性能（React.memo、useMemo、useCallback、虚拟列表、代码分割）
- 处理错误（ErrorBoundary、Suspense、async hooks 中的 try/catch）
- 编写 TypeScript 泛型组件和类型安全的 Context
- 实现数据获取（TanStack Query：useQuery、useMutation、useInfiniteQuery、乐观更新）
- 处理表单（React Hook Form + Zod 验证）

---

## 1. 组件组合模式

### 1.1 Compound Components（复合组件）

通过隐式共享状态，让一组组件协同工作，对外提供声明式 API：

```tsx
import { createContext, useContext, useState, type ReactNode } from 'react';

// ── Context ──────────────────────────────────────────────
interface TabsContextValue {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('Tabs.* must be used within <Tabs>');
  return ctx;
}

// ── Root ─────────────────────────────────────────────────
interface TabsProps {
  defaultTab: string;
  children: ReactNode;
  onChange?: (tab: string) => void;
}

function Tabs({ defaultTab, children, onChange }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  const handleSet = (tab: string) => {
    setActiveTab(tab);
    onChange?.(tab);
  };

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab: handleSet }}>
      <div role="tablist">{children}</div>
    </TabsContext.Provider>
  );
}

// ── Sub-components ───────────────────────────────────────
function TabList({ children }: { children: ReactNode }) {
  return <div className="tab-list">{children}</div>;
}

function Tab({ value, children }: { value: string; children: ReactNode }) {
  const { activeTab, setActiveTab } = useTabsContext();
  return (
    <button
      role="tab"
      aria-selected={activeTab === value}
      onClick={() => setActiveTab(value)}
      className={activeTab === value ? 'tab active' : 'tab'}
    >
      {children}
    </button>
  );
}

function TabPanel({ value, children }: { value: string; children: ReactNode }) {
  const { activeTab } = useTabsContext();
  if (activeTab !== value) return null;
  return <div role="tabpanel">{children}</div>;
}

// ── Attach ───────────────────────────────────────────────
Tabs.List = TabList;
Tabs.Tab = Tab;
Tabs.Panel = TabPanel;

// ── Usage ────────────────────────────────────────────────
// <Tabs defaultTab="profile" onChange={console.log}>
//   <Tabs.List>
//     <Tabs.Tab value="profile">Profile</Tabs.Tab>
//     <Tabs.Tab value="settings">Settings</Tabs.Tab>
//   </Tabs.List>
//   <Tabs.Panel value="profile"><ProfilePage /></Tabs.Panel>
//   <Tabs.Panel value="settings"><SettingsPage /></Tabs.Panel>
// </Tabs>
```

### 1.2 Render Props

将渲染逻辑委托给调用方，适合需要暴露内部状态的场景：

```tsx
interface MousePosition { x: number; y: number }

interface MouseTrackerProps {
  children: (position: MousePosition) => ReactNode;
}

function MouseTracker({ children }: MouseTrackerProps) {
  const [position, setPosition] = useState<MousePosition>({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent) => {
    setPosition({ x: e.clientX, y: e.clientY });
  };

  return <div onMouseMove={handleMouseMove}>{children(position)}</div>;
}

// Usage:
// <MouseTracker>
//   {({ x, y }) => <Tooltip style={{ left: x, top: y }}>Hover info</Tooltip>}
// </MouseTracker>
```

泛型 Render Props 列表组件：

```tsx
interface DataListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  renderEmpty?: () => ReactNode;
  keyExtractor: (item: T) => string;
}

function DataList<T>({ items, renderItem, renderEmpty, keyExtractor }: DataListProps<T>) {
  if (items.length === 0) return renderEmpty?.() ?? <p>No data</p>;

  return (
    <ul>
      {items.map((item, i) => (
        <li key={keyExtractor(item)}>{renderItem(item, i)}</li>
      ))}
    </ul>
  );
}
```

### 1.3 Higher-Order Components (HOC)

用函数包装组件，注入横切关注点（认证、权限、日志）：

```tsx
import { type ComponentType } from 'react';

interface WithAuthProps { user: User }

function withAuth<P extends WithAuthProps>(WrappedComponent: ComponentType<P>) {
  function AuthenticatedComponent(props: Omit<P, keyof WithAuthProps>) {
    const { user, isLoading } = useAuth();

    if (isLoading) return <Spinner />;
    if (!user) return <Navigate to="/login" />;

    return <WrappedComponent {...(props as P)} user={user} />;
  }

  AuthenticatedComponent.displayName =
    `withAuth(${WrappedComponent.displayName || WrappedComponent.name})`;

  return AuthenticatedComponent;
}

// const ProtectedDashboard = withAuth(Dashboard);
```

权限控制 HOC：

```tsx
function withPermission<P extends object>(
  WrappedComponent: ComponentType<P>,
  requiredPermission: string
) {
  function PermissionGuard(props: P) {
    const { permissions } = useAuth();

    if (!permissions.includes(requiredPermission)) {
      return <AccessDenied permission={requiredPermission} />;
    }

    return <WrappedComponent {...props} />;
  }

  PermissionGuard.displayName =
    `withPermission(${WrappedComponent.displayName || WrappedComponent.name})`;

  return PermissionGuard;
}

// const AdminPanel = withPermission(Panel, 'admin:read');
```

---

## 2. 自定义 Hooks 模式

### 2.1 useDebounce

防抖处理，常用于搜索输入：

```tsx
import { useState, useEffect } from 'react';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// Usage:
// const [search, setSearch] = useState('');
// const debouncedSearch = useDebounce(search, 300);
// const { data } = useQuery({
//   queryKey: ['search', debouncedSearch],
//   queryFn: () => searchApi(debouncedSearch),
//   enabled: debouncedSearch.length > 0,
// });
```

### 2.2 useFetch

通用数据获取 Hook（轻量场景，复杂场景请用 TanStack Query）：

```tsx
import { useState, useEffect, useCallback } from 'react';

interface UseFetchState<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
}

function useFetch<T>(url: string, options?: RequestInit): UseFetchState<T> & { refetch: () => void } {
  const [state, setState] = useState<UseFetchState<T>>({
    data: null,
    error: null,
    isLoading: true,
  });

  const fetchData = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data: T = await res.json();
      setState({ data, error: null, isLoading: false });
    } catch (err) {
      setState({ data: null, error: err as Error, isLoading: false });
    }
  }, [url]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { ...state, refetch: fetchData };
}
```

### 2.3 useLocalStorage

与 localStorage 同步的状态管理，支持跨标签页同步：

```tsx
import { useState, useCallback, useEffect } from 'react';

function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue(prev => {
        const nextValue = value instanceof Function ? value(prev) : value;
        window.localStorage.setItem(key, JSON.stringify(nextValue));
        return nextValue;
      });
    },
    [key],
  );

  const removeValue = useCallback(() => {
    window.localStorage.removeItem(key);
    setStoredValue(initialValue);
  }, [key, initialValue]);

  // 跨标签页同步
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        setStoredValue(JSON.parse(e.newValue) as T);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [key]);

  return [storedValue, setValue, removeValue] as const;
}
```

### 2.4 useMediaQuery

响应式断点检测：

```tsx
import { useState, useEffect } from 'react';

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    setMatches(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

// const isMobile = useMediaQuery('(max-width: 768px)');
// const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
// const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
```

### 2.5 useOnClickOutside

点击外部区域关闭弹出层：

```tsx
import { useEffect, type RefObject } from 'react';

function useOnClickOutside(ref: RefObject<HTMLElement>, handler: () => void) {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) return;
      handler();
    };
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler]);
}
```

---

## 3. 状态管理

### 3.1 useState 进阶：派生状态与惰性初始化

```tsx
// ❌ BAD: 冗余状态
const [items, setItems] = useState<Item[]>([]);
const [filteredItems, setFilteredItems] = useState<Item[]>([]); // 冗余！
const [count, setCount] = useState(0); // 冗余！

// ✅ GOOD: 派生计算
const [items, setItems] = useState<Item[]>([]);
const [filter, setFilter] = useState('');

const filteredItems = useMemo(
  () => items.filter(item => item.name.includes(filter)),
  [items, filter],
);
const count = filteredItems.length; // 直接派生

// ✅ GOOD: 惰性初始化（只在首次渲染时执行）
const [rows, setRows] = useState(() => computeExpensiveDefault());
```

不可变更新对象状态：

```tsx
interface FormState {
  name: string;
  email: string;
  age: number;
}

const [form, setForm] = useState<FormState>({ name: '', email: '', age: 0 });

// 类型安全的字段更新
const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
  setForm(prev => ({ ...prev, [key]: value }));
```

### 3.2 useReducer 复杂状态

状态转换逻辑复杂或状态之间有依赖时，优先使用 useReducer：

```tsx
import { useReducer } from 'react';

interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

type TodoAction =
  | { type: 'ADD'; payload: { id: string; text: string } }
  | { type: 'TOGGLE'; payload: { id: string } }
  | { type: 'DELETE'; payload: { id: string } }
  | { type: 'EDIT'; payload: { id: string; text: string } }
  | { type: 'CLEAR_COMPLETED' }
  | { type: 'SET_FILTER'; payload: 'all' | 'active' | 'completed' };

interface TodoState {
  todos: readonly Todo[];
  filter: 'all' | 'active' | 'completed';
}

function todoReducer(state: TodoState, action: TodoAction): TodoState {
  switch (action.type) {
    case 'ADD':
      return {
        ...state,
        todos: [...state.todos, { ...action.payload, completed: false }],
      };
    case 'TOGGLE':
      return {
        ...state,
        todos: state.todos.map(t =>
          t.id === action.payload.id ? { ...t, completed: !t.completed } : t
        ),
      };
    case 'DELETE':
      return {
        ...state,
        todos: state.todos.filter(t => t.id !== action.payload.id),
      };
    case 'EDIT':
      return {
        ...state,
        todos: state.todos.map(t =>
          t.id === action.payload.id ? { ...t, text: action.payload.text } : t
        ),
      };
    case 'CLEAR_COMPLETED':
      return { ...state, todos: state.todos.filter(t => !t.completed) };
    case 'SET_FILTER':
      return { ...state, filter: action.payload };
    default:
      return state;
  }
}

// const [state, dispatch] = useReducer(todoReducer, { todos: [], filter: 'all' });
// dispatch({ type: 'ADD', payload: { id: crypto.randomUUID(), text: 'Learn React' } });
```

### 3.3 Zustand Store 模式

轻量级全局状态管理，无需 Provider 包裹：

```tsx
import { create } from 'zustand';
import { devtools, persist, immer } from 'zustand/middleware';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

interface AuthActions {
  login: (credentials: Credentials) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
}

type AuthStore = AuthState & AuthActions;

const useAuthStore = create<AuthStore>()(
  devtools(
    persist(
      immer((set, get) => ({
        user: null,
        token: null,
        isAuthenticated: false,

        login: async (credentials) => {
          const { user, token } = await authApi.login(credentials);
          set(state => {
            state.user = user;
            state.token = token;
            state.isAuthenticated = true;
          });
        },

        logout: () => {
          set(state => {
            state.user = null;
            state.token = null;
            state.isAuthenticated = false;
          });
        },

        refreshToken: async () => {
          const { token } = await authApi.refresh(get().token!);
          set(state => { state.token = token; });
        },
      })),
      { name: 'auth-store' }
    ),
    { name: 'AuthStore' }
  )
);

// Selector（防止不必要 re-render）
const useUser = () => useAuthStore(state => state.user);
const useIsAuthenticated = () => useAuthStore(state => state.isAuthenticated);
```

购物车 Store 示例（含计算属性）：

```tsx
interface CartStore {
  items: CartItem[];
  addItem: (product: Product, quantity: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  totalPrice: () => number;
  totalItems: () => number;
}

const useCartStore = create<CartStore>()(
  devtools(
    persist(
      (set, get) => ({
        items: [],

        addItem: (product, quantity) =>
          set(state => {
            const existing = state.items.find(i => i.productId === product.id);
            if (existing) {
              return {
                items: state.items.map(i =>
                  i.productId === product.id
                    ? { ...i, quantity: i.quantity + quantity }
                    : i
                ),
              };
            }
            return {
              items: [...state.items, { productId: product.id, product, quantity }],
            };
          }),

        removeItem: (productId) =>
          set(state => ({
            items: state.items.filter(i => i.productId !== productId),
          })),

        updateQuantity: (productId, quantity) =>
          set(state => ({
            items: quantity <= 0
              ? state.items.filter(i => i.productId !== productId)
              : state.items.map(i =>
                  i.productId === productId ? { ...i, quantity } : i
                ),
          })),

        clearCart: () => set({ items: [] }),

        totalPrice: () =>
          get().items.reduce((sum, i) => sum + i.product.price * i.quantity, 0),

        totalItems: () =>
          get().items.reduce((sum, i) => sum + i.quantity, 0),
      }),
      { name: 'cart-storage' }
    )
  )
);
```

---

## 4. 性能优化

### 4.1 React.memo + useMemo + useCallback

```tsx
import { memo, useMemo, useCallback } from 'react';

interface ListItemProps {
  item: Item;
  onSelect: (id: string) => void;
}

// memo 避免父组件 re-render 时子组件不必要地重新渲染
const ListItem = memo(function ListItem({ item, onSelect }: ListItemProps) {
  return <li onClick={() => onSelect(item.id)}>{item.name}</li>;
});

// 自定义比较函数
const UserCard = memo(
  function UserCard({ user }: { user: User }) {
    return <div>{user.name} - {user.email}</div>;
  },
  (prevProps, nextProps) => prevProps.user.id === nextProps.user.id
);

function ItemList({ items, filter }: { items: Item[]; filter: string }) {
  // useMemo 缓存昂贵计算结果
  const filteredItems = useMemo(
    () => items.filter(i => i.name.toLowerCase().includes(filter.toLowerCase())),
    [items, filter]
  );

  // useCallback 稳定回调引用，避免子组件无谓 re-render
  const handleSelect = useCallback((id: string) => {
    console.log('Selected:', id);
  }, []);

  return (
    <ul>
      {filteredItems.map(item => (
        <ListItem key={item.id} item={item} onSelect={handleSelect} />
      ))}
    </ul>
  );
}
```

### 4.2 虚拟列表（@tanstack/react-virtual）

只渲染可视区域的列表项，大幅提升长列表性能：

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';

function VirtualList({ items }: { items: Item[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 5,
  });

  return (
    <div ref={parentRef} style={{ height: '400px', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map(virtualRow => (
          <div
            key={virtualRow.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            {items[virtualRow.index].name}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 4.3 代码分割（React.lazy + Suspense）

```tsx
import { lazy, Suspense } from 'react';

// 路由级代码分割
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Settings = lazy(() => import('./pages/Settings'));
const Analytics = lazy(() => import('./pages/Analytics'));

// 带命名导出的懒加载
const Chart = lazy(() =>
  import('./components/Chart').then(mod => ({ default: mod.Chart }))
);

function App() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/analytics" element={<Analytics />} />
      </Routes>
    </Suspense>
  );
}
```

---

## 5. 错误处理

### 5.1 ErrorBoundary

```tsx
import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  fallback: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  children: ReactNode;
}

interface ErrorBoundaryState { error: Error | null }

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.props.onError?.(error, errorInfo);
  }

  resetError = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      const { fallback } = this.props;
      return typeof fallback === 'function'
        ? fallback(this.state.error, this.resetError)
        : fallback;
    }
    return this.props.children;
  }
}

// Usage:
// <ErrorBoundary
//   fallback={(error, reset) => (
//     <div role="alert">
//       <p>Something went wrong: {error.message}</p>
//       <button onClick={reset}>Try again</button>
//     </div>
//   )}
//   onError={(error) => reportToSentry(error)}
// >
//   <App />
// </ErrorBoundary>
```

也可用 `react-error-boundary` 库简化：

```tsx
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div role="alert">
      <h2>Page Error</h2>
      <pre>{error.message}</pre>
      <button onClick={resetErrorBoundary}>Retry</button>
    </div>
  );
}

// <ErrorBoundary FallbackComponent={ErrorFallback} onReset={() => queryClient.clear()}>
//   <Suspense fallback={<Spinner />}><App /></Suspense>
// </ErrorBoundary>
```

### 5.2 Async Hook 中的错误处理

```tsx
function useAsyncAction<T>(asyncFn: () => Promise<T>) {
  const [state, setState] = useState<{
    data: T | null;
    error: Error | null;
    isLoading: boolean;
  }>({ data: null, error: null, isLoading: false });

  const execute = useCallback(async () => {
    setState({ data: null, error: null, isLoading: true });
    try {
      const data = await asyncFn();
      setState({ data, error: null, isLoading: false });
      return data;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setState({ data: null, error, isLoading: false });
      throw error;
    }
  }, [asyncFn]);

  return { ...state, execute };
}

// const { data, error, isLoading, execute } = useAsyncAction(
//   () => api.deleteUser(userId)
// );
```

---

## 6. TypeScript 泛型组件与类型安全 Context

### 6.1 泛型列表组件

```tsx
interface ListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  keyExtractor: (item: T) => string;
  emptyMessage?: string;
}

function List<T>({ items, renderItem, keyExtractor, emptyMessage }: ListProps<T>) {
  if (items.length === 0) return <p>{emptyMessage ?? 'No items'}</p>;
  return (
    <ul>
      {items.map((item, i) => (
        <li key={keyExtractor(item)}>{renderItem(item, i)}</li>
      ))}
    </ul>
  );
}

// TypeScript 自动推断 T:
// <List items={users} keyExtractor={u => u.id} renderItem={u => <span>{u.name}</span>} />
```

### 6.2 泛型 Select 组件

```tsx
interface SelectProps<T> {
  options: T[];
  value: T | null;
  onChange: (value: T) => void;
  getLabel: (option: T) => string;
  getValue: (option: T) => string;
  placeholder?: string;
}

function Select<T>({ options, value, onChange, getLabel, getValue, placeholder }: SelectProps<T>) {
  return (
    <select
      value={value ? getValue(value) : ''}
      onChange={e => {
        const selected = options.find(o => getValue(o) === e.target.value);
        if (selected) onChange(selected);
      }}
    >
      <option value="">{placeholder ?? 'Select...'}</option>
      {options.map(option => (
        <option key={getValue(option)} value={getValue(option)}>
          {getLabel(option)}
        </option>
      ))}
    </select>
  );
}
```

### 6.3 类型安全的 Context 工厂

```tsx
import { createContext, useContext, type ReactNode } from 'react';

function createSafeContext<T>(displayName: string) {
  const Context = createContext<T | undefined>(undefined);
  Context.displayName = displayName;

  function useCtx(): T {
    const ctx = useContext(Context);
    if (ctx === undefined) {
      throw new Error(`use${displayName} must be used within <${displayName}Provider>`);
    }
    return ctx;
  }

  function Provider({ value, children }: { value: T; children: ReactNode }) {
    return <Context.Provider value={value}>{children}</Context.Provider>;
  }

  return [Provider, useCtx] as const;
}

// interface Theme { mode: 'light' | 'dark'; primary: string }
// const [ThemeProvider, useTheme] = createSafeContext<Theme>('Theme');
```

---

## 7. 数据获取：TanStack Query

### 7.1 Query Key 工厂 + useQuery

```tsx
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';

// ── Query Key 工厂 ──────────────────────────────────────
const userKeys = {
  all:     ['users'] as const,
  lists:   ()              => [...userKeys.all, 'list'] as const,
  list:    (filters: UserFilters) => [...userKeys.lists(), filters] as const,
  details: ()              => [...userKeys.all, 'detail'] as const,
  detail:  (id: string)    => [...userKeys.details(), id] as const,
};

// ── useQuery ─────────────────────────────────────────────
function useUser(id: string) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: () => api.getUser(id),
    staleTime: 5 * 60 * 1000,   // 5 min
    gcTime: 30 * 60 * 1000,     // 30 min (formerly cacheTime)
    retry: 2,
    enabled: !!id,
  });
}

function useUsers(filters: UserFilters) {
  return useQuery({
    queryKey: userKeys.list(filters),
    queryFn: () => api.getUsers(filters),
    staleTime: 60_000,
    placeholderData: keepPreviousData, // 过滤切换时保留旧数据
  });
}
```

### 7.2 useMutation + 乐观更新

```tsx
function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateUserDto) => api.updateUser(data.id, data),

    onMutate: async (newData) => {
      // 取消进行中的请求
      await queryClient.cancelQueries({ queryKey: userKeys.detail(newData.id) });

      // 保存旧数据用于回滚
      const previousUser = queryClient.getQueryData(userKeys.detail(newData.id));

      // 乐观更新
      queryClient.setQueryData(userKeys.detail(newData.id), (old: User) => ({
        ...old,
        ...newData,
      }));

      return { previousUser };
    },

    onError: (_err, newData, context) => {
      if (context?.previousUser) {
        queryClient.setQueryData(userKeys.detail(newData.id), context.previousUser);
      }
    },

    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: userKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}
```

### 7.3 useInfiniteQuery

```tsx
function useInfiniteUsers(filters: UserFilters) {
  return useInfiniteQuery({
    queryKey: userKeys.list(filters),
    queryFn: ({ pageParam }) =>
      api.getUsers({ ...filters, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 60_000,
  });
}

// const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteUsers(filters);
// const allUsers = data?.pages.flatMap(page => page.items) ?? [];
```

---

## 8. 表单：React Hook Form + Zod

### 8.1 基本表单

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const createUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(50),
  email: z.string().email('Please enter a valid email'),
  age: z.coerce.number().int().min(0).max(150),
  role: z.enum(['admin', 'user', 'editor']),
  bio: z.string().max(500).optional(),
});

type CreateUserForm = z.infer<typeof createUserSchema>;

function CreateUserForm({ onSubmit }: { onSubmit: (data: CreateUserForm) => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: '', email: '', age: 0, role: 'user' },
  });

  const handleFormSubmit = async (data: CreateUserForm) => {
    await onSubmit(data);
    reset();
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)}>
      <div>
        <label htmlFor="name">Name</label>
        <input id="name" {...register('name')} />
        {errors.name && <span role="alert">{errors.name.message}</span>}
      </div>

      <div>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" {...register('email')} />
        {errors.email && <span role="alert">{errors.email.message}</span>}
      </div>

      <div>
        <label htmlFor="role">Role</label>
        <select id="role" {...register('role')}>
          <option value="user">User</option>
          <option value="editor">Editor</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creating...' : 'Create User'}
      </button>
    </form>
  );
}
```

### 8.2 动态表单字段（useFieldArray）

```tsx
import { useFieldArray } from 'react-hook-form';

const teamSchema = z.object({
  teamName: z.string().min(1),
  members: z.array(
    z.object({
      name: z.string().min(1),
      email: z.string().email(),
    })
  ).min(1, 'At least one member is required'),
});

type TeamForm = z.infer<typeof teamSchema>;

function TeamFormComponent() {
  const { control, register, handleSubmit, formState: { errors } } = useForm<TeamForm>({
    resolver: zodResolver(teamSchema),
    defaultValues: { teamName: '', members: [{ name: '', email: '' }] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'members' });

  return (
    <form onSubmit={handleSubmit(console.log)}>
      <input {...register('teamName')} placeholder="Team Name" />
      {errors.teamName && <span>{errors.teamName.message}</span>}

      {fields.map((field, index) => (
        <div key={field.id}>
          <input {...register(`members.${index}.name`)} placeholder="Name" />
          <input {...register(`members.${index}.email`)} placeholder="Email" />
          {fields.length > 1 && (
            <button type="button" onClick={() => remove(index)}>Remove</button>
          )}
        </div>
      ))}

      <button type="button" onClick={() => append({ name: '', email: '' })}>
        Add Member
      </button>
      <button type="submit">Submit</button>
    </form>
  );
}
```
