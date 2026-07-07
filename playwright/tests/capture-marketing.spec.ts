// Marketing screenshot capture — drives the REAL product (local frontend + prod backend) through
// each FSM state and saves theme-paired screenshots for the landing page's Anatomy console.
// The product is the imagery: no mocks, no staged HTML — actual room, dashboard, scorecard.
//
// Run:  OF_FRONTEND_URL=http://localhost:3000 OF_TEST_PASSWORD=… \
//         npx playwright test capture-marketing --project=matrix
// Writes: ../frontend/public/shots/{invite,oral,coding,score}-{dark,light}.png

import { test } from '@playwright/test';
import { mkdirSync } from 'fs';
import { resolve } from 'path';
import { createInterview, deleteInterview } from '../helpers/create-interview';
import { CandidateRoom } from '../helpers/room';
import { config } from '../helpers/env';

const OUT = resolve(__dirname, '../../frontend/public/shots');
const VIEW = { width: 1440, height: 900 };

const ORAL_ANSWER =
  'I recently built a real-time analytics pipeline — the hardest part was exactly-once delivery, ' +
  'so I designed idempotent consumers with offset checkpointing and validated it under replay.';

const WRONG_ATTEMPT = ['import sys', 'data = sys.stdin.read().split()', 'print(len(data))'].join(
  '\n'
);

let createdId: string | null = null;
test.afterEach(async () => {
  if (createdId) await deleteInterview(createdId);
  createdId = null;
});

for (const theme of ['dark', 'light'] as const) {
  test(`capture ${theme} shots: oral, coding(+probe), invite, score`, async ({ browser }) => {
    test.setTimeout(400_000);
    mkdirSync(OUT, { recursive: true });

    const ctx = await browser.newContext({
      viewport: VIEW,
      deviceScaleFactor: 2,
      // browser.newContext() does NOT inherit the project's `use` — re-grant device permissions.
      permissions: ['camera', 'microphone'],
    });
    // Theme must be set before any page script runs (next-themes reads localStorage at boot).
    await ctx.addInitScript((t) => localStorage.setItem('overforge-theme', t), theme);
    const page = await ctx.newPage();
    page.on('requestfailed', (r) =>
      console.log(`[requestfailed] ${r.method()} ${r.url()} — ${r.failure()?.errorText}`)
    );

    const interview = await createInterview({ language: 'python', level: 'mid' });
    createdId = interview.id;
    const room = new CandidateRoom(page);

    // ── oral ──
    await room.enter(interview.link);
    await room.waitForSettled();
    await room.answer(ORAL_ANSWER);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/oral-${theme}.png` });

    // ── coding + probe ──
    await room.advanceThroughOral(ORAL_ANSWER);
    await room.waitForCoding(30_000);
    await room.typeCode(WRONG_ATTEMPT);
    await room.run();
    await room.typeCode(WRONG_ATTEMPT + '\n# rework');
    await room.run(); // second consecutive failure → the probe fires and shows in the chat
    await room.waitForAssist('probe', 25_000).catch(() => undefined);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/coding-${theme}.png` });

    // Conclude so scoring kicks off while we capture the dashboard.
    await page.getByRole('button', { name: 'End', exact: true }).click();
    await page.getByRole('button', { name: 'End interview' }).click();
    await page.waitForTimeout(1500);

    // ── invite (dashboard) + score (detail) — as the signed-in interviewer ──
    const dash = await ctx.newPage();
    await dash.goto(`${config.frontendUrl ?? 'http://localhost:3000'}/auth`, {
      waitUntil: 'networkidle', // React must hydrate before the form handlers exist
    });
    await dash.waitForTimeout(800);
    await dash.locator('#email').fill(config.testEmail);
    await dash.locator('#password').fill(config.testPassword());
    await dash.locator('button[type="submit"]').click();
    try {
      await dash.waitForURL(/\/dashboard/, { timeout: 20_000 });
    } catch {
      // Hydration/auth race — log what the auth page actually shows, then retry the submit once.
      const err = await dash
        .locator('#auth-error, [role="alert"]')
        .allInnerTexts()
        .catch(() => []);
      console.log(`[auth-retry] still on ${dash.url()} — inline: ${JSON.stringify(err)}`);
      await dash.screenshot({ path: `${OUT}/_debug-auth-${theme}.png` });
      await dash.locator('button[type="submit"]').click();
      await dash.waitForURL(/\/dashboard/, { timeout: 30_000 });
    }
    await dash.waitForTimeout(2500);
    await dash.screenshot({ path: `${OUT}/invite-${theme}.png` });

    // Poll the detail page until the scorecard lands (MiniMax scoring takes a moment).
    const detail = `${config.frontendUrl ?? 'http://localhost:3000'}/dashboard/${interview.id}`;
    let scored = false;
    for (let i = 0; i < 24 && !scored; i++) {
      await dash.goto(detail, { waitUntil: 'domcontentloaded' });
      await dash.waitForTimeout(5000);
      scored = (await dash.getByText(/overall|recommendation|hire/i).count()) > 0;
    }
    await dash.waitForTimeout(800);
    await dash.screenshot({ path: `${OUT}/score-${theme}.png` });

    await ctx.close();
  });
}
