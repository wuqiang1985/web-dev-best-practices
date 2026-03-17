---
name: react-testing
description: Vitest + React Testing Library + MSW + Playwright E2E 测试策略深度参考，涵盖组件测试、Hook 测试、API Mock、快照测试、Page Object Model、覆盖率配置。
origin: web-dev-best-practices
---

# React 测试策略

React 应用的完整测试体系：单元测试、组件测试、集成测试、E2E 测试深度参考。

## When to Activate

- 编写 React 组件测试（渲染、交互、异步）
- 测试自定义 Hooks（renderHook）
- 测试 Context/Provider 包裹的组件
- 配置 MSW（Mock Service Worker）进行 API mock
- 编写快照测试
- 编写 Playwright E2E 测试（Page Object Model、fixture、截图）
- 配置 Vitest 和覆盖率报告

---

## 1. Vitest 配置

### 1.1 基本配置

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['src/test/e2e/**'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
      exclude: [
        '**/*.d.ts',
        '**/*.stories.tsx',
        '**/*.config.{ts,js}',
        'src/test/**',
        'src/config/**',
        'src/types/**',
        'src/main.tsx',
      ],
    },
    // 并行测试
    pool: 'forks',
    poolOptions: {
      forks: { minForks: 1, maxForks: 4 },
    },
  },
});
```

### 1.2 Setup 文件

```typescript
// src/test/setup.ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, afterAll } from 'vitest';
import { server } from './mocks/server';

// 自动清理 DOM
afterEach(() => {
  cleanup();
});

// MSW server
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Mock matchMedia (for components using useMediaQuery)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
});
```

---

## 2. React Testing Library 查询优先级

按照可访问性优先级选择查询方法：

```typescript
// ✅ 优先级 1: 可访问性查询（最推荐）
screen.getByRole('button', { name: 'Submit' });
screen.getByRole('heading', { level: 2 });
screen.getByRole('textbox', { name: 'Email' });
screen.getByRole('checkbox', { name: 'Accept terms' });
screen.getByRole('combobox');
screen.getByRole('tab', { selected: true });

// ✅ 优先级 2: 语义查询
screen.getByLabelText('Email');          // <label>
screen.getByPlaceholderText('Search');   // placeholder
screen.getByText('Welcome');             // 可见文本
screen.getByDisplayValue('John');        // input 当前值

// ✅ 优先级 3: Test ID（作为最后手段）
screen.getByTestId('custom-element');

// ❌ 避免：直接查 DOM
// container.querySelector('.my-class')  // 脆弱，耦合实现细节
```

### 查询变体

```typescript
// getBy*   — 找到返回元素，找不到抛错（同步断言）
// queryBy* — 找到返回元素，找不到返回 null（断言不存在）
// findBy*  — 返回 Promise，自动等待（异步元素）

// 断言元素存在
expect(screen.getByText('Hello')).toBeInTheDocument();

// 断言元素不存在
expect(screen.queryByText('Error')).not.toBeInTheDocument();

// 等待异步元素出现
const element = await screen.findByText('Loaded data');
```

---

## 3. 组件测试模式

### 3.1 渲染测试

```typescript
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './Badge';

describe('Badge', () => {
  it('should render children text', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('should apply variant class', () => {
    render(<Badge variant="success">Active</Badge>);
    expect(screen.getByText('Active')).toHaveClass('badge-success');
  });

  it('should render with default props', () => {
    const { container } = render(<Badge>Tag</Badge>);
    expect(container.firstChild).toHaveAttribute('data-variant', 'default');
  });

  it('should forward additional props', () => {
    render(<Badge data-testid="badge" aria-label="status">Info</Badge>);
    expect(screen.getByTestId('badge')).toHaveAttribute('aria-label', 'status');
  });
});
```

### 3.2 交互测试

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Counter } from './Counter';

describe('Counter', () => {
  it('should increment count on click', async () => {
    const user = userEvent.setup();
    render(<Counter initialCount={0} />);

    expect(screen.getByText('Count: 0')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Increment' }));
    expect(screen.getByText('Count: 1')).toBeInTheDocument();
  });

  it('should call onChange callback', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Counter initialCount={0} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Increment' }));
    expect(onChange).toHaveBeenCalledWith(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('should handle keyboard interaction', async () => {
    const user = userEvent.setup();
    render(<Counter initialCount={0} />);

    const button = screen.getByRole('button', { name: 'Increment' });
    button.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('Count: 1')).toBeInTheDocument();
  });
});
```

### 3.3 异步测试

```typescript
import { render, screen, waitFor, waitForElementToBeRemoved } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SearchBox } from './SearchBox';

describe('SearchBox', () => {
  it('should show search results after typing', async () => {
    const user = userEvent.setup();
    render(<SearchBox />);

    await user.type(screen.getByRole('searchbox'), 'React');

    // 等待 debounce + API 响应
    await waitFor(() => {
      expect(screen.getByText('React Patterns')).toBeInTheDocument();
    });
  });

  it('should show and then hide loading indicator', async () => {
    const user = userEvent.setup();
    render(<SearchBox />);

    await user.type(screen.getByRole('searchbox'), 'React');
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    await waitForElementToBeRemoved(() => screen.queryByRole('progressbar'));
  });

  it('should show empty state when no results', async () => {
    const user = userEvent.setup();
    render(<SearchBox />);

    await user.type(screen.getByRole('searchbox'), 'nonexistent_query_xyz');

    await waitFor(() => {
      expect(screen.getByText('No results found')).toBeInTheDocument();
    });
  });
});
```

### 3.4 表单测试

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LoginForm } from './LoginForm';

describe('LoginForm', () => {
  it('should submit valid form data', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<LoginForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });
  });

  it('should show validation errors for empty fields', async () => {
    const user = userEvent.setup();
    render(<LoginForm onSubmit={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      expect(screen.getByText('Email is required')).toBeInTheDocument();
      expect(screen.getByText('Password is required')).toBeInTheDocument();
    });
  });

  it('should show email format error', async () => {
    const user = userEvent.setup();
    render(<LoginForm onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Email'), 'invalid');
    await user.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      expect(screen.getByText('Please enter a valid email')).toBeInTheDocument();
    });
  });

  it('should disable submit button while submitting', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(() => new Promise(r => setTimeout(r, 1000)));
    render(<LoginForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Login' }));

    expect(screen.getByRole('button', { name: 'Logging in...' })).toBeDisabled();
  });
});
```

---

## 4. Hook 测试

### 4.1 基本 Hook 测试

```typescript
import { renderHook, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useCounter } from './useCounter';

describe('useCounter', () => {
  it('should initialize with given value', () => {
    const { result } = renderHook(() => useCounter(10));
    expect(result.current.count).toBe(10);
  });

  it('should increment and decrement', () => {
    const { result } = renderHook(() => useCounter(0));

    act(() => result.current.increment());
    expect(result.current.count).toBe(1);

    act(() => result.current.decrement());
    expect(result.current.count).toBe(0);
  });

  it('should respect min/max bounds', () => {
    const { result } = renderHook(() => useCounter(5, { min: 0, max: 10 }));

    act(() => result.current.set(15));
    expect(result.current.count).toBe(10);

    act(() => result.current.set(-5));
    expect(result.current.count).toBe(0);
  });

  it('should reset to initial value', () => {
    const { result } = renderHook(() => useCounter(5));

    act(() => result.current.increment());
    act(() => result.current.reset());
    expect(result.current.count).toBe(5);
  });
});
```

### 4.2 带 Provider 的 Hook 测试

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { useUsers } from './useUsers';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

function createWrapper() {
  const queryClient = createTestQueryClient();

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe('useUsers', () => {
  it('should fetch users successfully', async () => {
    const { result } = renderHook(() => useUsers(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].name).toBe('Alice');
  });

  it('should handle fetch error', async () => {
    // MSW handler override in test for error scenario
    server.use(
      http.get('/api/users', () => HttpResponse.json(null, { status: 500 }))
    );

    const { result } = renderHook(() => useUsers(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeDefined();
  });
});
```

### 4.3 Context/Provider 测试

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ThemeProvider, useTheme } from './ThemeContext';

function TestConsumer() {
  const { mode, toggle } = useTheme();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <button onClick={toggle}>Toggle</button>
    </div>
  );
}

describe('ThemeContext', () => {
  it('should provide default theme', () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    );
    expect(screen.getByTestId('mode')).toHaveTextContent('light');
  });

  it('should toggle theme', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Toggle' }));
    expect(screen.getByTestId('mode')).toHaveTextContent('dark');
  });

  it('should throw when used outside provider', () => {
    // Suppress console.error from ErrorBoundary
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<TestConsumer />)).toThrow(
      'useTheme must be used within <ThemeProvider>'
    );

    spy.mockRestore();
  });
});
```

---

## 5. MSW（Mock Service Worker）

### 5.1 Handler 定义

```typescript
// src/test/mocks/handlers.ts
import { http, HttpResponse, delay } from 'msw';

const users = [
  { id: '1', name: 'Alice', email: 'alice@example.com' },
  { id: '2', name: 'Bob', email: 'bob@example.com' },
];

export const handlers = [
  // GET 列表
  http.get('/api/users', async ({ request }) => {
    const url = new URL(request.url);
    const search = url.searchParams.get('search');

    await delay(100); // 模拟网络延迟

    const filtered = search
      ? users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()))
      : users;

    return HttpResponse.json({
      success: true,
      data: filtered,
      meta: { total: filtered.length },
    });
  }),

  // GET 详情
  http.get('/api/users/:id', ({ params }) => {
    const user = users.find(u => u.id === params.id);
    if (!user) {
      return HttpResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'User not found' } },
        { status: 404 }
      );
    }
    return HttpResponse.json({ success: true, data: user });
  }),

  // POST 创建
  http.post('/api/users', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    const newUser = { id: '3', ...body };
    return HttpResponse.json(
      { success: true, data: newUser },
      { status: 201 }
    );
  }),

  // PUT 更新
  http.put('/api/users/:id', async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({
      success: true,
      data: { id: params.id, ...body },
    });
  }),

  // DELETE
  http.delete('/api/users/:id', () => {
    return new HttpResponse(null, { status: 204 });
  }),
];
```

### 5.2 Server 配置

```typescript
// src/test/mocks/server.ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

### 5.3 在测试中覆盖 Handler

```typescript
import { http, HttpResponse } from 'msw';
import { server } from '../test/mocks/server';

it('should show error when API fails', async () => {
  // 临时覆盖 handler
  server.use(
    http.get('/api/users', () => {
      return HttpResponse.json(
        { success: false, error: { code: 'SERVER_ERROR', message: 'Service unavailable' } },
        { status: 500 }
      );
    })
  );

  render(<UserList />);

  await waitFor(() => {
    expect(screen.getByText('Service unavailable')).toBeInTheDocument();
  });
});

it('should handle network error', async () => {
  server.use(
    http.get('/api/users', () => {
      return HttpResponse.error(); // 模拟网络错误
    })
  );

  render(<UserList />);

  await waitFor(() => {
    expect(screen.getByText(/network error/i)).toBeInTheDocument();
  });
});

it('should handle slow response', async () => {
  server.use(
    http.get('/api/users', async () => {
      await delay(5000); // 模拟慢响应
      return HttpResponse.json({ success: true, data: [] });
    })
  );

  render(<UserList />);
  // 验证 loading 状态持续存在
  expect(screen.getByRole('progressbar')).toBeInTheDocument();
});
```

---

## 6. 快照测试

```typescript
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from './Card';

describe('Card snapshots', () => {
  // ✅ GOOD: 小而聚焦的快照
  it('should match snapshot for default variant', () => {
    const { container } = render(
      <Card title="Test Card">Content here</Card>
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  // ✅ GOOD: inline snapshot 更直观
  it('should render correct structure', () => {
    const { container } = render(<Card title="Hello">World</Card>);
    expect(container.firstChild).toMatchInlineSnapshot(`
      <div
        class="card card-default"
      >
        <h3>Hello</h3>
        <div>World</div>
      </div>
    `);
  });

  // ❌ BAD: 大型组件的完整快照（脆弱，难以审查）
  // it('should match app snapshot', () => {
  //   const { container } = render(<EntireApp />);
  //   expect(container).toMatchSnapshot();
  // });
});
```

快照测试最佳实践：
- 只对小型、稳定的 UI 组件使用快照
- 优先使用 inline snapshot（更容易审查）
- 快照应该小且聚焦
- 有意义的变更应该更新快照（`vitest -u`）
- 快照不替代行为测试

---

## 7. Playwright E2E 测试

### 7.1 配置

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
    ...(process.env.CI ? [['github' as const]] : []),
  ],

  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],

  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
```

### 7.2 Page Object Model

```typescript
// tests/e2e/pages/LoginPage.ts
import { type Page, type Locator, expect } from '@playwright/test';

export class LoginPage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly successMessage: Locator;

  constructor(private page: Page) {
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Password');
    this.submitButton = page.getByRole('button', { name: 'Login' });
    this.errorMessage = page.getByRole('alert');
    this.successMessage = page.getByText('Login successful');
  }

  async goto() {
    await this.page.goto('/login');
    await this.page.waitForLoadState('networkidle');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async expectError(message: string) {
    await expect(this.errorMessage).toContainText(message);
  }

  async expectRedirectTo(path: string) {
    await expect(this.page).toHaveURL(path);
  }

  async expectLoginSuccess() {
    await expect(this.successMessage).toBeVisible();
  }
}

// tests/e2e/pages/DashboardPage.ts
export class DashboardPage {
  readonly heading: Locator;
  readonly userMenu: Locator;
  readonly logoutButton: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: 'Dashboard' });
    this.userMenu = page.getByRole('button', { name: /user menu/i });
    this.logoutButton = page.getByRole('menuitem', { name: 'Logout' });
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible();
  }

  async logout() {
    await this.userMenu.click();
    await this.logoutButton.click();
  }
}
```

### 7.3 E2E 测试用例

```typescript
// tests/e2e/auth.spec.ts
import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';

test.describe('Authentication', () => {
  test('should login with valid credentials', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('user@example.com', 'password123');
    await loginPage.expectRedirectTo('/dashboard');

    const dashboard = new DashboardPage(page);
    await dashboard.expectLoaded();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('wrong@example.com', 'wrong');
    await loginPage.expectError('Invalid email or password');
  });

  test('should redirect unauthenticated users to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/login');
  });

  test('should persist session after refresh', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('user@example.com', 'password123');

    await page.reload();

    const dashboard = new DashboardPage(page);
    await dashboard.expectLoaded();
  });
});
```

### 7.4 Fixtures

```typescript
// tests/e2e/fixtures.ts
import { test as base, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';

interface TestFixtures {
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
  authenticatedPage: DashboardPage;
}

export const test = base.extend<TestFixtures>({
  loginPage: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await use(loginPage);
  },

  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },

  // 预先完成登录的 fixture
  authenticatedPage: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('user@example.com', 'password123');
    await page.waitForURL('/dashboard');

    const dashboard = new DashboardPage(page);
    await use(dashboard);
  },
});

export { expect };

// Usage:
// import { test, expect } from './fixtures';
// test('should show user data', async ({ authenticatedPage }) => {
//   await authenticatedPage.expectLoaded();
// });
```

### 7.5 Visual Regression Testing

```typescript
import { test, expect } from '@playwright/test';

test('homepage visual regression', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // 全页截图对比
  await expect(page).toHaveScreenshot('homepage.png', {
    maxDiffPixelRatio: 0.01,
  });

  // 组件截图对比
  const header = page.getByRole('banner');
  await expect(header).toHaveScreenshot('header.png');
});
```

---

## 8. 测试工具函数

### 8.1 通用 render wrapper

```typescript
// src/test/test-utils.tsx
import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '../contexts/ThemeContext';

interface ExtendedRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  queryClient?: QueryClient;
  route?: string;
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function renderWithProviders(
  ui: React.ReactElement,
  {
    queryClient = createTestQueryClient(),
    route = '/',
    ...renderOptions
  }: ExtendedRenderOptions = {}
) {
  window.history.pushState({}, 'Test page', route);

  function AllProviders({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </BrowserRouter>
      </QueryClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: AllProviders, ...renderOptions }),
    queryClient,
  };
}

// Re-export everything
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
```

### 8.2 常用测试数据工厂

```typescript
// src/test/factories.ts
let idCounter = 0;

export function createUser(overrides?: Partial<User>): User {
  idCounter++;
  return {
    id: `user-${idCounter}`,
    name: `User ${idCounter}`,
    email: `user${idCounter}@example.com`,
    role: 'user',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createUsers(count: number, overrides?: Partial<User>): User[] {
  return Array.from({ length: count }, () => createUser(overrides));
}
```

---

## 9. 覆盖率配置与报告

```bash
# 运行测试并生成覆盖率报告
npx vitest run --coverage

# 仅运行变更文件的测试
npx vitest --changed

# Watch 模式（开发时使用）
npx vitest

# CI 模式（运行一次并退出）
npx vitest run
```

覆盖率阈值策略：

| 层级 | 目标 | 说明 |
|------|------|------|
| 语句覆盖率 | >= 80% | 最基本的度量 |
| 分支覆盖率 | >= 80% | if/else/switch 路径 |
| 函数覆盖率 | >= 80% | 每个函数至少被调用一次 |
| 行覆盖率 | >= 80% | 每行代码至少被执行一次 |

关键模块（认证、支付）应达到 90%+。UI 展示组件 70% 即可。
