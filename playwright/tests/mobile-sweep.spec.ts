// Mobile QA sweep — full-page screenshots of every marketing page at phone size, both themes.
// Review output by eye; this spec asserts nothing (it's a capture harness, not a gate).
//
// Run:  OF_FRONTEND_URL=http://localhost:3000 HEADLESS=1 \
//         npx playwright test mobile-sweep --project=matrix
// Writes: /tmp/finite-mobile/{page}-{theme}.png

import { test } from '@playwright/test';
import { mkdirSync } from 'fs';
import { config } from '../helpers/env';

const OUT = '/tmp/finite-mobile';
const VIEW = { width: 390, height: 844 }; // iPhone 14-class

const PAGES = [
  { name: 'landing', path: '/' },
  { name: 'product', path: '/product' },
  { name: 'how-it-works', path: '/how-it-works' },
  { name: 'pricing', path: '/pricing' },
  { name: 'about', path: '/about' },
] as const;

for (const theme of ['dark', 'light'] as const) {
  test(`mobile sweep — ${theme}`, async ({ browser }) => {
    test.setTimeout(180_000);
    mkdirSync(OUT, { recursive: true });

    const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, isMobile: true });
    await ctx.addInitScript((t) => localStorage.setItem('overforge-theme', t), theme);
    const page = await ctx.newPage();

    for (const p of PAGES) {
      await page.goto(`${config.frontendUrl ?? 'http://localhost:3000'}${p.path}`, {
        waitUntil: 'networkidle',
      });
      // Reveal is IntersectionObserver-gated — walk the page so every section fires before the
      // full-page shot, else everything below the fold captures at opacity-0.
      await page.evaluate(async () => {
        const step = window.innerHeight * 0.8;
        for (let y = 0; y < document.body.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 120));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(1200); // let reveals/counters settle
      // Horizontal overflow is the #1 mobile bug — log it loudly.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      if (overflow > 1) console.log(`[overflow] ${p.name}-${theme}: +${overflow}px horizontal`);
      await page.screenshot({ path: `${OUT}/${p.name}-${theme}.png`, fullPage: true });
    }

    await ctx.close();
  });
}
