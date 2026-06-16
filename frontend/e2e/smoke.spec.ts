import { test, expect, waitForHealthy } from './fixtures';

test.describe('Smoke — homepage & static surfaces', () => {
  test('homepage loads and shows the Overforge title', async ({ page }) => {
    await page.goto('/');
    // Title is in <title> tag
    await expect(page).toHaveTitle(/Overforge/i);
    // And the page should have at least one CTA / hero element
    await expect(page.locator('body')).toBeVisible();
  });

  test('homepage responds 200 over HTTP', async ({ page }) => {
    const response = await page.goto('/');
    expect(response, 'no response from homepage').not.toBeNull();
    expect(response!.status(), 'homepage should return 200').toBe(200);
  });

  test('auth page renders without crashing', async ({ page }) => {
    const response = await page.goto('/auth');
    // Either 200 (auth UI) or 307/302 redirect to login — both are fine
    expect(response).not.toBeNull();
    const status = response!.status();
    expect([200, 307, 302, 308]).toContain(status);
  });
});
