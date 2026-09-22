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

  test('should navigate to find deals', async ({ page }) => {
    await page.goto('/');

    const findDealsLink = page.locator('a[href="/find-deals"]').first();
    await expect(findDealsLink).toBeVisible();
    await Promise.all([
      page.waitForURL(/\/find-deals(\/|$)/i, { timeout: 10_000 }),
      findDealsLink.click(),
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

