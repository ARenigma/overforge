import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config for overForge.
 *
 * Tests assume the full stack is reachable via env vars:
 *   - PLAYWRIGHT_BASE_URL (default: http://localhost:3000)
 *   - BACKEND_URL (default: http://localhost:5001)
 *   - AI_MODULE_URL (default: http://localhost:9001)
 *
 * webServer is OPT-IN via PLAYWRIGHT_START_WEB_SERVER=true. In CI we let
 * the workflow start services explicitly so we can parallelise boot.
 */
const startWebServer = process.env.PLAYWRIGHT_START_WEB_SERVER === 'true';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  // 30s default — most flows are fast, AI ones can be slow
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : 'list',

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  // When running locally with `npm run test:e2e`, this boots the frontend.
  // CI passes PLAYWRIGHT_START_WEB_SERVER=false and boots services itself.
  webServer: startWebServer
    ? {
        command: 'npm run start',
        port: 3000,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
        env: {
          NEXT_PUBLIC_API_URL: process.env.BACKEND_URL || 'http://localhost:5001',
          NEXT_PUBLIC_SOCKET_URL: process.env.BACKEND_URL || 'http://localhost:5001',
          NEXT_PUBLIC_SUPABASE_URL:
            process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://test.supabase.co',
          NEXT_PUBLIC_SUPABASE_ANON_KEY:
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key',
        },
      }
    : undefined,
});
