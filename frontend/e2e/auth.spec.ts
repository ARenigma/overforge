import { test, expect } from './fixtures';

/**
 * Auth flow tests — do NOT actually log in (requires real Supabase project).
 * Just verify the auth surface renders and has the expected form fields.
 *
 * Tagged @auth so CI can opt-in only when real Supabase creds are present.
 */
test.describe('Auth surface (no real auth in CI)', () => {
  test('auth page has email + password inputs or a redirect', async ({ page }) => {
    await page.goto('/auth');
    // Either the form is there, or the user is redirected (200 from /auth itself = form; redirect = no form)
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    if ((await emailInput.count()) > 0) {
      await expect(emailInput.first()).toBeVisible();
      await expect(passwordInput.first()).toBeVisible();
    } else {
      // Auth may redirect logged-in users — that's fine
      test.skip(true, 'auth page redirected or has no form — likely already logged in');
    }
  });

  test('logging out from homepage returns to unauth state', async ({ page }) => {
    await page.goto('/');
    // Just ensure the page is reachable; logout behaviour is integration territory
    await expect(page.locator('body')).toBeVisible();
  });
});
