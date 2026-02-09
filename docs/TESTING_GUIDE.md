# Testing Guide: What, Why, and When

## What Are These Tests Actually Testing?

### 1. Unit Tests (`lib/__tests__/itinerary.test.ts`)

**What they test:** Core business logic functions that power your trip planning feature.

**Specific tests:**
- `countDaysInclusive()` - Calculates the number of days between two dates (inclusive)
  - ✅ Same day = 1 day
  - ✅ Consecutive dates = correct count
  - ✅ Invalid dates = handled gracefully
  
- `buildTripPlanFromStopsAndNights()` - Builds a day-by-day itinerary from stops and nights
  - ✅ Single stop with one night works
  - ✅ Multiple stops with different nights per stop
  - ✅ Empty inputs handled safely
  - ✅ Mismatched arrays handled gracefully

- `buildSimpleTripPlan()` - High-level trip planning with start/end cities and waypoints
  - ✅ Creates plan with start and end cities
  - ✅ Includes waypoints in the route

**Why this matters:** These functions are the **core of your trip planner**. If they break, users can't plan trips. These tests catch bugs like:
- Off-by-one errors in date calculations
- Incorrect day assignments
- Missing waypoints in routes

---

### 2. API Route Tests (`app/api/__tests__/trips.test.ts`)

**What they test:** Your `/api/trips` endpoint - the backend that stores and retrieves user trips.

**Specific tests:**
- **GET /api/trips** - Retrieves trips for a user
  - ✅ Returns trips in correct format
  - ✅ Returns empty array when no trips exist

- **POST /api/trips** - Creates/saves a new trip
  - ✅ Successfully creates a trip with all required fields
  - ✅ Returns 400 error for invalid request body
  - ✅ Auto-generates ID if not provided
  - ✅ Overrides userId to DEMO_USER_ID (security - prevents user impersonation)

**Why this matters:** This is your **data persistence layer**. These tests catch:
- API breaking changes
- Security vulnerabilities (user ID manipulation)
- Data corruption (missing IDs, invalid formats)
- Validation failures

**Real-world scenario:** If someone breaks the POST endpoint, users can't save their trips. These tests would catch it immediately.

---

### 3. Component Tests (`components/__tests__/Hero.test.tsx`)

**What they test:** React component rendering and user interface elements.

**Specific tests:**
- ✅ Component renders without crashing
- ✅ Main heading displays correctly
- ✅ Description text is present
- ✅ Navigation links are present and accessible

**Why this matters:** These catch UI regressions. If someone accidentally:
- Removes the heading
- Breaks the component structure
- Removes navigation links

The tests will fail before it reaches production.

---

### 4. E2E Tests (`e2e/*.spec.ts`)

**What they test:** Complete user workflows from start to finish.

**Current tests:**
- Homepage loads and displays content
- Navigation to trip planner works
- Trip planner page loads

**Why this matters:** These test the **entire user experience**. They catch:
- Broken navigation flows
- Missing pages
- Integration issues between frontend and backend

---

## Why Was This a Critical Tech Debt Issue?

### 1. **No Safety Net for Changes**

**Before tests:**
- Making changes = gambling
- Refactoring = high risk of breaking things
- No way to know if code still works after changes

**After tests:**
- Make changes with confidence
- Tests tell you immediately if something broke
- Can refactor safely

**Example:** If you want to refactor `countDaysInclusive()` to handle timezones, the tests will tell you if you broke existing functionality.

---

### 2. **Bugs Reach Production**

**Before tests:**
- Bugs discovered by users in production
- Expensive to fix (hotfixes, rollbacks)
- Damages user trust

**After tests:**
- Bugs caught during development
- Fix before deployment
- Users never see broken features

**Example:** Without tests, a bug in trip date calculation could let users create invalid trips. Tests catch this immediately.

---

### 3. **Slower Development**

**Before tests:**
- Manual testing after every change
- Fear of breaking things = slower development
- Hard to know what's safe to change

**After tests:**
- Automated testing = faster feedback
- Confident development
- Clear documentation of expected behavior

**Example:** Instead of manually testing trip creation 10 times, run `npm run test` and get results in seconds.

---

### 4. **No Documentation of Expected Behavior**

**Before tests:**
- Code is the only documentation
- Hard to understand what functions should do
- New developers don't know expected behavior

**After tests:**
- Tests = living documentation
- Clear examples of how code should work
- New developers can read tests to understand

**Example:** A new developer can read `itinerary.test.ts` to understand exactly how trip planning works.

---

### 5. **Technical Debt Compounds**

**Before tests:**
- Each change adds risk
- Code becomes harder to change
- Eventually, codebase becomes unmaintainable

**After tests:**
- Tests enable safe refactoring
- Can pay down technical debt gradually
- Codebase stays maintainable

---

## When Should You Run These Tests?

### 1. **During Development (Local)**

**Run tests frequently while coding:**
```bash
# Watch mode - runs tests automatically when you save files
npm run test

# Or run specific test file
npm run test -- lib/__tests__/itinerary.test.ts
```

**When:**
- ✅ After writing new code
- ✅ Before committing changes
- ✅ When refactoring existing code
- ✅ When fixing bugs (write test first, then fix)

**Best practice:** Keep `npm run test` running in watch mode while developing.

---

### 2. **Before Committing (Pre-commit)**

**Run all tests before git commit:**
```bash
npm run test -- --run
```

**When:**
- ✅ Before every `git commit`
- ✅ Before pushing to any branch

**Why:** Ensures you're not committing broken code.

**Pro tip:** Set up a git pre-commit hook to run tests automatically:
```bash
# Create .git/hooks/pre-commit
#!/bin/sh
npm run test -- --run
```

---

### 3. **Before Pushing to Dev/Staging**

**Run full test suite:**
```bash
npm run test:all  # Unit + E2E tests
```

**When:**
- ✅ Before pushing to `develop` branch
- ✅ Before creating pull requests
- ✅ Before deploying to staging

**Why:** Catches integration issues before they reach shared branches.

---

### 4. **In CI/CD Pipeline (Automated)**

**Set up automated testing in GitHub Actions or similar:**

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run test -- --run
      - run: npm run test:e2e
```

**When:**
- ✅ Automatically on every push
- ✅ Automatically on every pull request
- ✅ Before merging to main/master

**Why:** 
- Catches issues even if developer forgot to run tests
- Prevents broken code from being merged
- Provides confidence in code quality

---

### 5. **Before Production Deployment**

**Run full test suite + coverage:**
```bash
npm run test:coverage
npm run test:e2e
```

**When:**
- ✅ Before deploying to production
- ✅ As part of release process

**Why:** Final safety check before users see changes.

---

## Recommended Workflow

### Daily Development:
1. **Start work:** `npm run test` (watch mode)
2. **Write code:** Tests run automatically
3. **Before commit:** `npm run test -- --run` (verify all pass)
4. **Commit:** Only if tests pass

### Before Push:
1. **Run full suite:** `npm run test:all`
2. **Check coverage:** `npm run test:coverage`
3. **Push:** Only if everything passes

### CI/CD (Automatic):
1. **On push:** Tests run automatically
2. **On PR:** Tests must pass before merge
3. **On merge:** Tests run before deployment

---

## Test Coverage Goals

Aim for:
- **Critical paths:** 80%+ coverage (trip planning, API routes)
- **Business logic:** 90%+ coverage (calculations, validations)
- **Components:** 60%+ coverage (focus on logic, not styling)
- **E2E:** Cover main user flows (trip creation, navigation)

---

## What to Test (Priority Order)

### High Priority (Test First):
1. ✅ **Business logic** - Trip calculations, date handling
2. ✅ **API routes** - Data persistence, validation
3. ✅ **Authentication** - User security
4. ✅ **Form validation** - User input handling

### Medium Priority:
5. **Components** - UI rendering, user interactions
6. **Utilities** - Helper functions, formatters
7. **Integration** - Component + API interactions

### Lower Priority:
8. **Styling** - Visual appearance (hard to test, low value)
9. **Third-party libraries** - Don't test library code

---

## Summary

**What:** Tests verify your code works correctly and catches bugs early.

**Why Critical:** Without tests, you're flying blind - no safety net, bugs reach production, development slows down.

**When to Run:**
- ✅ **During development** - Watch mode
- ✅ **Before commits** - Quick verification
- ✅ **Before pushes** - Full suite
- ✅ **In CI/CD** - Automatic on every push/PR
- ✅ **Before production** - Final check

**Bottom line:** Tests are your safety net. Run them often, automate them, and trust them. They'll save you time, money, and headaches.
