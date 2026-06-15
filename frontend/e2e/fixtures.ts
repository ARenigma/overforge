import { test as base, expect, type Page } from '@playwright/test';

/**
 * Shared fixtures and helpers for E2E tests.
 *
 *   import { test, expect } from './fixtures';
 */

export type ApiEndpoints = {
  health: string;
  aiHealth: string;
  availableProblems: string;
};

const backendURL = process.env.BACKEND_URL || 'http://localhost:5001';
const aiURL = process.env.AI_MODULE_URL || 'http://localhost:9001';

export const endpoints: ApiEndpoints = {
  health: `${backendURL}/health`,
  aiHealth: `${aiURL}/health`,
  availableProblems: `${backendURL}/api/parameter-selection/available-problems`,
};

/**
 * Custom test fixture that exposes the API endpoints to specs.
 */
export const test = base.extend<{ endpoints: ApiEndpoints; page: Page }>({
  endpoints: async ({}, use) => {
    await use(endpoints);
  },
  page: async ({ page }, use) => {
    // Surface console errors from the app — useful in CI logs
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });
    await use(page);
    // After test, log captured errors so failures are easier to diagnose
    if (errors.length && process.env.DEBUG_E2E) {
      console.log(`[e2e] Captured ${errors.length} console errors on ${page.url()}`);
      errors.forEach((e) => console.log('  ', e));
    }
  },
});

export { expect };

/**
 * Polls an endpoint until it's healthy or the timeout elapses.
 * Returns the last response (or null if never reachable).
 */
export async function waitForHealthy(url: string, timeoutMs = 30_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  return false;
}
