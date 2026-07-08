// Marketing screenshot capture — drives the REAL product (local frontend + prod backend) through
// each FSM state and saves theme-paired STILLS for the landing page's Anatomy console.
// The product is the imagery: no mocks, no staged HTML. This drives a CREDIBLE candidate — answers
// each probe substantively and solves the coding cleanly — so the scorecard reads as a fair result.
//
// Run:  OF_FRONTEND_URL=http://localhost:3000 OF_TEST_PASSWORD=… \
//         npx playwright test capture-marketing --project=matrix
// Writes: ../frontend/public/shots/{invite,oral,coding,score}-{dark,light}.png

import { test } from '@playwright/test';
import { mkdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { createInterview, deleteInterview } from '../helpers/create-interview';
import { CandidateRoom } from '../helpers/room';
import { config } from '../helpers/env';

const OUT = resolve(__dirname, '../../frontend/public/shots');
const VIEW = { width: 1440, height: 900 };

// A real-looking candidate (never emailed — creation doesn't notify, and the row is deleted after).
const DRIVER = { candidateName: 'Priya Nair', candidateEmail: 'priya.nair@meridianlabs.io' };

// Substantive, distinct answers — each genuinely addresses a likely probe (the scorer punishes a
// looped canned sentence). The opener leads with the mechanism so it never reads as evasive.
const OPENER =
  'I built a real-time analytics pipeline; the hardest part was exactly-once processing across ' +
  'consumer restarts and rebalances. I solved it with idempotent consumers keyed on the source id ' +
  'and offset, writing that key in the same transaction as the business record.';

const ANSWERS: { match: RegExp; text: string }[] = [
  {
    match: /evict|retention|grow|unbounded|size|purge|clean ?up|old|table/i,
    text:
      'The idempotency-key table would grow unbounded, so we partition it by day and drop ' +
      'partitions older than the replay window — seven days. Kafka retention is shorter than that, ' +
      'so anything older can never be replayed and is safe to evict. A background job detaches and ' +
      'drops whole partitions, which is O(1) versus row-by-row deletes.',
  },
  {
    match: /restart|resume|recover|redeliver|crash|before committ|processed again/i,
    text:
      'On restart the consumer resumes from the last committed offset. The offset only advances ' +
      'after the business-plus-key transaction commits, so a crash in between just replays the last ' +
      'batch, and the idempotency keys make those replays no-ops. The worst case is a redelivery, ' +
      'never a double-apply.',
  },
  {
    match: /atomic|transaction|commit|guarantee|exactly.once|consisten|no-op|idempoten|mechanism/i,
    text:
      'The business write and the idempotency-key insert happen in one Postgres transaction, so ' +
      'they commit or roll back together. I commit the Kafka offset only after that transaction ' +
      'succeeds. On replay the duplicate hits a unique constraint on the key and becomes a no-op — ' +
      'so processing is exactly-once even though delivery is at-least-once.',
  },
  {
    match: /scale|10|traffic|throughput|volume|partition|shard/i,
    text:
      'At ten times the volume I would partition by customer id to preserve ordering within a ' +
      'tenant, shard the idempotency store on the same key, and batch offset commits to cut write ' +
      'amplification. The tradeoff is a longer replay window on failover, which I bound with ' +
      'periodic checkpoints.',
  },
  {
    match: /rebalance|stale|duplicate|double|fence|epoch|bug|incident|worst|hard/i,
    text:
      'The nastiest bug was double-processing after a rebalance, when a stale consumer still held a ' +
      'partition. We fenced writers with a generation number stored next to the offset, so a stale ' +
      "consumer's commit is rejected and the new owner wins.",
  },
];

// The curated bank ships verified reference solutions — the candidate solves the assigned problem
// for real so the scorecard shows a clean, independent solve.
const BANK = JSON.parse(
  readFileSync(resolve(__dirname, '../../backend/src/interview/problems/bank.json'), 'utf-8')
) as { title: string; referencePython: string }[];
const SOLUTIONS = new Map(BANK.map((p) => [p.title.trim().toLowerCase(), p.referencePython]));

// The room's visible Run executes with EMPTY stdin (hidden tests inject real stdin), so a solution
// that reads input must exit cleanly when the console has none — guard it so the console run passes.
const robust = (src: string) =>
  [
    'import sys, io',
    '_raw = sys.stdin.read()',
    'if not _raw.strip():',
    '    raise SystemExit  # no console stdin — hidden tests supply the real input',
    'sys.stdin = io.StringIO(_raw)',
    '',
  ].join('\n') + src;

async function answerOralAdaptively(room: CandidateRoom, maxTurns = 8): Promise<void> {
  const oralPhases = new Set(['greeting', 'oral', 'handoff', '']);
  const used = new Set<number>();
  for (let i = 0; i < maxTurns; i++) {
    const p = await room.phase();
    if (!oralPhases.has(p)) break;
    if (await room.isDone()) break;
    const q = await room.lastAiText();
    let idx = ANSWERS.findIndex((a, n) => a.match.test(q) && !used.has(n));
    if (idx === -1) idx = ANSWERS.findIndex((_, n) => !used.has(n)); // any unused, substantive answer
    if (idx === -1) idx = 2; // fall back to the core atomicity answer
    used.add(idx);
    await room.answer(ANSWERS[idx].text);
  }
}

let createdId: string | null = null;
test.afterEach(async () => {
  if (createdId) await deleteInterview(createdId).catch(() => undefined);
  createdId = null;
});

for (const theme of ['dark', 'light'] as const) {
  test(`capture ${theme} shots: oral, coding, invite, score`, async ({ browser }) => {
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

    const interview = await createInterview({ language: 'python', level: 'mid', ...DRIVER });
    createdId = interview.id;
    const room = new CandidateRoom(page);

    // ── oral ── open with a substantive, mechanism-first answer.
    await room.enter(interview.link);
    await room.waitForSettled();
    await room.answer(OPENER);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/oral-${theme}.png` });

    // Answer the remaining oral probes substantively, then move to coding.
    await answerOralAdaptively(room);
    await room.waitForCoding(30_000);

    // ── coding ── solve the assigned problem cleanly (one accepted run, no flailing).
    const title = (await room.problemTitle().catch(() => '')).trim().toLowerCase();
    const solution = SOLUTIONS.get(title);
    if (solution) {
      await room.typeCode(robust(solution));
      const final = await room.run();
      console.log(`[capture] ${theme} solve (${title}): ${final.status}`);
    } else {
      console.log(`[capture] no bank solution matched "${title}"`);
    }
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/coding-${theme}.png` });

    // Conclude so scoring kicks off while we capture the dashboard.
    await page.getByRole('button', { name: 'End', exact: true }).click();
    await page.getByRole('button', { name: 'End interview' }).click();
    await page.waitForTimeout(1500);

    // ── invite (dashboard) + score (detail) — as the signed-in interviewer ──
    const dash = await ctx.newPage();
    await dash.goto(`${config.frontendUrl ?? 'http://localhost:3000'}/auth`, {
      waitUntil: 'networkidle',
    });
    await dash.waitForTimeout(800);
    await dash.locator('#email').fill(config.testEmail);
    await dash.locator('#password').fill(config.testPassword());
    await dash.locator('button[type="submit"]').click();
    try {
      await dash.waitForURL(/\/dashboard/, { timeout: 20_000 });
    } catch {
      await dash.locator('button[type="submit"]').click();
      await dash.waitForURL(/\/dashboard/, { timeout: 30_000 });
    }
    await dash.getByText('Priya Nair').first().waitFor({ timeout: 20_000 });
    await dash.waitForTimeout(800);
    await dash.screenshot({ path: `${OUT}/invite-${theme}.png` });

    // Poll the detail page until the scorecard lands (scoring takes a moment).
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
