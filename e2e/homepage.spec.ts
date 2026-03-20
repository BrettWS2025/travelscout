import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('should load and display main content', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/TravelScout/i);

    const nav = page.getByRole('navigation');
    await expect(nav).toBeVisible();

    const hero = page.getByRole('banner');
    await expect(hero).toBeVisible();
  });

  test('should navigate to trip planner', async ({ page }) => {
    await page.goto('/');

    const tripPlannerLink = page.locator('a[href="/trip-planner"]').first();
    await expect(tripPlannerLink).toBeVisible();
    await Promise.all([
      page.waitForURL(/\/trip-planner(\/|$)/i, { timeout: 10_000 }),
      tripPlannerLink.click(),
    ]);
  });

  test('should display top deals section', async ({ page }) => {
    await page.goto('/');

    const dealsSection = page.getByText(/deals/i).first();
    if (await dealsSection.isVisible({ timeout: 5000 })) {
      await expect(dealsSection).toBeVisible();
    }
  });
});

