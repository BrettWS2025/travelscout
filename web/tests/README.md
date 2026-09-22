# Testing Guide

This project uses a comprehensive testing setup with:
- **Vitest** for unit and integration tests
- **React Testing Library** for component tests
- **Playwright** for end-to-end (E2E) tests

## Quick Start

### Install Dependencies
```bash
npm install
```

### Run All Tests
```bash
npm run test:all
```

### Run Unit/Integration Tests Only
```bash
npm run test
```

### Run Tests in Watch Mode
```bash
npm run test
# Press 'a' to run all tests, or use filters
```

### Run Tests with UI
```bash
npm run test:ui
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Run E2E Tests
```bash
npm run test:e2e
```

### Run E2E Tests with UI
```bash
npm run test:e2e:ui
```

## Test Structure

```
├── lib/__tests__/          # Unit tests for library functions
├── app/api/__tests__/      # API route tests
├── components/__tests__/   # Component tests
├── e2e/                    # End-to-end tests
└── tests/
    ├── setup.ts            # Test configuration and mocks
    └── README.md           # This file
```

## Writing Tests

### Unit Tests (Vitest)

Example unit test for a utility function:

```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from '../myFunction';

describe('myFunction', () => {
  it('should do something', () => {
    expect(myFunction('input')).toBe('expected');
  });
});
```

### Component Tests (React Testing Library)

Example component test:

```typescript
import { render, screen } from '@testing-library/react';
import { MyComponent } from '../MyComponent';

describe('MyComponent', () => {
  it('should render', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

### API Route Tests

Example API route test:

```typescript
import { GET, POST } from '../route';

describe('/api/my-route', () => {
  it('should return data', async () => {
    const response = await GET();
    // Assert response
  });
});
```

### E2E Tests (Playwright)

Example E2E test:

```typescript
import { test, expect } from '@playwright/test';

test('should navigate to page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/TravelScout/i);
});
```

## Test Coverage Goals

- **Critical paths**: 80%+ coverage
- **API routes**: 70%+ coverage
- **Utility functions**: 90%+ coverage
- **Components**: 60%+ coverage (focus on logic, not styling)

## Best Practices

1. **Test behavior, not implementation** - Focus on what the code does, not how
2. **Write tests first** - Use TDD for new features when possible
3. **Keep tests simple** - One assertion per test when possible
4. **Use descriptive names** - Test names should describe what they test
5. **Mock external dependencies** - Don't make real API calls in unit tests
6. **Test edge cases** - Include error cases and boundary conditions

## CI/CD Integration

Tests should run automatically in CI/CD pipelines. Make sure to:
- Run `npm run test` in CI
- Run `npm run test:e2e` in CI (may require additional setup)
- Set up coverage reporting

## Troubleshooting

### Tests failing with module resolution errors
- Check that `vitest.config.ts` has correct path aliases
- Ensure `tsconfig.json` paths match

### E2E tests timing out
- Increase timeout in `playwright.config.ts`
- Check that dev server is running on correct port

### Component tests failing with Next.js errors
- Check `tests/setup.ts` for proper Next.js mocks
- Ensure all Next.js components are properly mocked
