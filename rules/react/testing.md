# React 测试规范

> 此文件扩展 [common/testing.md](../common/testing.md)，添加 React 测试特定内容。

## 测试框架

| 层级 | 工具 | 用途 |
|------|------|------|
| 单元测试 | Vitest + React Testing Library | 组件、hooks、工具函数 |
| API Mock | MSW (Mock Service Worker) | 拦截网络请求 |
| E2E 测试 | Playwright | 完整用户流程 |
| 覆盖率 | Vitest Coverage (c8/istanbul) | 80%+ 门槛 |

## 组件测试原则

### 测试行为，不测试实现

```typescript
// ❌ BAD: 测试实现细节
it('should set state to loading', () => {
  const { result } = renderHook(() => useAuth());
  expect(result.current.state).toBe('loading');
});

// ✅ GOOD: 测试用户可见行为
it('should show loading spinner while fetching', () => {
  render(<UserList />);
  expect(screen.getByRole('progressbar')).toBeInTheDocument();
});
```

### 查询优先级

```typescript
// 按优先级选择查询方式
screen.getByRole('button', { name: '提交' });    // 1. Role（最佳）
screen.getByLabelText('邮箱');                    // 2. Label
screen.getByPlaceholderText('请输入邮箱');         // 3. Placeholder
screen.getByText('欢迎回来');                      // 4. Text
screen.getByTestId('submit-btn');                  // 5. TestId（最后选择）
```

## 组件测试示例

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LoginForm } from './LoginForm';

describe('LoginForm', () => {
  it('should call onSubmit with email and password', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<LoginForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('邮箱'), 'test@example.com');
    await user.type(screen.getByLabelText('密码'), 'password123');
    await user.click(screen.getByRole('button', { name: '登录' }));

    expect(onSubmit).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    });
  });

  it('should show validation error for invalid email', async () => {
    const user = userEvent.setup();
    render(<LoginForm onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('邮箱'), 'invalid');
    await user.click(screen.getByRole('button', { name: '登录' }));

    expect(screen.getByText('邮箱格式不正确')).toBeInTheDocument();
  });
});
```

## Hook 测试

```typescript
import { renderHook, act } from '@testing-library/react';
import { useCounter } from './useCounter';

describe('useCounter', () => {
  it('should increment counter', () => {
    const { result } = renderHook(() => useCounter(0));

    act(() => {
      result.current.increment();
    });

    expect(result.current.count).toBe(1);
  });
});
```

## MSW API Mock

```typescript
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

const server = setupServer(
  http.get('/api/users', () => {
    return HttpResponse.json({
      success: true,
      data: [{ id: '1', name: 'Test User' }],
    });
  }),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

## E2E 测试（Playwright）

```typescript
// tests/e2e/login.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test('should login successfully with valid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('邮箱').fill('user@example.com');
    await page.getByLabel('密码').fill('password123');
    await page.getByRole('button', { name: '登录' }).click();

    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByText('欢迎回来')).toBeVisible();
  });
});
```

## 快照测试

谨慎使用，仅用于 UI regression 检测：

```typescript
// ✅ 适用：稳定的展示组件
it('should match snapshot', () => {
  const { container } = render(<Badge variant="success">Active</Badge>);
  expect(container).toMatchSnapshot();
});

// ❌ 不适用：包含动态数据的组件
```

## 覆盖率配置

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
      exclude: ['**/*.stories.tsx', '**/*.d.ts', 'src/config/**'],
    },
  },
});
```
