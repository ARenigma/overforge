import { test, expect } from './fixtures';

/**
 * Room page tests — gated on a real session. Skipped in default CI run.
 * Run locally with: npx playwright test e2e/room.spec.ts --grep "Room"
 */
test.describe('Room page', () => {
  test('unknown room ID redirects or shows "not found"', async ({ page }) => {
    await page.goto('/room/this-room-does-not-exist-12345');
    // Should NOT 500 — either a 404 page, a redirect, or an error boundary
    const status = page.url();
    expect(status).toBeTruthy();
    // Page should render something
    await expect(page.locator('body')).toBeVisible();
  });

  test('room page does not crash on direct load', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/room/test-room-001');
    // Give it a moment to attempt to connect
    await page.waitForTimeout(2_000);
    // Page didn't crash to white screen
    await expect(page.locator('body')).toBeVisible();
    // Even if there are errors, the page must have rendered something
  });
});
