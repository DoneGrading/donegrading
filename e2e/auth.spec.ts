import { test, expect } from '@playwright/test';

test.describe('Auth flow', () => {
  test('home page loads and shows sign-in options', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /welcome|sign in|donegrading/i })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/sign in with google/i)).toBeVisible();
  });
});
