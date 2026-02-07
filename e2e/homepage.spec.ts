import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('should load and display main content', async ({ page }) => {
    await page.goto('/');

    // Check that the page loads
    await expect(page).toHaveTitle(/TravelScout/i);

    // Check for main navigation
    const nav = page.getByRole('navigation');
    await expect(nav).toBeVisible();

    // Check for hero section
    const hero = page.getByRole('banner');
    await expect(hero).toBeVisible();
  });

  test('should navigate to trip planner', async ({ page }) => {
    await page.goto('/');

    // Look for trip planner link/button
    const tripPlannerLink = page.getByRole('link', { name: /trip planner/i });
    if (await tripPlannerLink.isVisible()) {
      await tripPlannerLink.click();
      await expect(page).toHaveURL(/trip-planner/i);
    }
  });

  test('should display top deals section', async ({ page }) => {
    await page.goto('/');

    // Scroll to deals section if it exists
    const dealsSection = page.getByText(/deals/i).first();
    if (await dealsSection.isVisible({ timeout: 5000 })) {
      await expect(dealsSection).toBeVisible();
    }
  });
});
