import { test, expect, waitForHealthy } from './fixtures';

test.describe('API health', () => {
  test('backend /health responds 200 and reports services', async ({ endpoints }) => {
    const ok = await waitForHealthy(endpoints.health, 30_000);
    expect(ok, `backend not healthy at ${endpoints.health}`).toBe(true);

    const res = await fetch(endpoints.health);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('status', 'OK');
    expect(body).toHaveProperty('services');
  });

  test('backend /api/parameter-selection/available-problems responds (may 401 without auth)', async ({
    endpoints,
  }) => {
    // We don't assume auth — just that the route is wired
    const res = await fetch(endpoints.availableProblems, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    // 200 (with empty list) or 401/400 (auth/validation) are both acceptable smoke signals
    expect([200, 400, 401, 403, 422, 500]).toContain(res.status);
  });

  test('AI module /health responds (or 404 — depends on the route)', async ({ endpoints }) => {
    // AI module exposes /docs at minimum; we just verify the port is open
    try {
      const res = await fetch(endpoints.aiHealth);
      // /health might not exist — accept any 2xx/3xx/4xx as "port is up"
      expect(res.status).toBeLessThan(500);
    } catch (e) {
      // Port closed = AI module didn't boot
      throw new Error(`AI module not reachable at ${endpoints.aiHealth}: ${(e as Error).message}`);
    }
  });
});
