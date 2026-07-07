// Marketing screenshot capture — drives the REAL product (local frontend + prod backend) through
// each FSM state and saves theme-paired screenshots for the landing page's Anatomy console.
// The product is the imagery: no mocks, no staged HTML — actual room, dashboard, scorecard.
//
// Run:  OF_FRONTEND_URL=http://localhost:3000 OF_TEST_PASSWORD=… \
//         npx playwright test capture-marketing --project=matrix
// Writes: ../frontend/public/shots/{invite,oral,coding,score}-{dark,light}.png
//         plus hover-state pairs {invite,coding}-active-{dark,light}.png

import { test } from '@playwright/test';
import { mkdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { createInterview, deleteInterview } from '../helpers/create-interview';
import { CandidateRoom } from '../helpers/room';
import { config } from '../helpers/env';

const OUT = resolve(__dirname, '../../frontend/public/shots');
const VIEW = { width: 1440, height: 900 };

// Distinct substantive answers so the scorer reads a real candidate, not a looped sentence —
// the scorecard shot should show a credible hire signal, not a 0/5 "canned answers" verdict.
const ORAL_ANSWERS = [
  'I recently built a real-time analytics pipeline — the hardest part was exactly-once delivery, ' +
    'so I designed idempotent consumers with offset checkpointing and validated it under replay.',
  'Each consumer keeps an idempotency key per event — a hash of the source ID and offset — stored ' +
    'in Postgres in the same transaction as the business write, so replays become no-ops. Offsets ' +
    'only advance after that transaction commits.',
  'If traffic grew ten times I would partition by customer ID to preserve ordering within a ' +
    'tenant, shard the idempotency store, and batch offset commits — the tradeoff is a longer ' +
    'replay window after a crash, which we bound with periodic snapshots.',
  'The nastiest bug was a consumer double-processing after a rebalance. We fixed it by fencing ' +
    'writers with an epoch number, so a stale consumer’s commits get rejected instead of ' +
    'racing the new owner.',
  'If the consumer crashes after the business write but before the offset commit, the event is ' +
    'redelivered — but the idempotency key was written in the same transaction as the business ' +
    'record, so the replay hits the key and becomes a no-op, and the offset advances on the ' +
    'retry. The crash window costs a redelivery, never a double-apply.',
];

// A realistic mid-solve attempt (parses input, brute-force skeleton, unfinished condition) — it
// fills the editor like real work-in-progress and fails hidden tests without crashing.
const WRONG_ATTEMPT = [
  'import sys',
  '',
  'def solve(raw: str) -> str:',
  '    values = [int(x) for x in raw.split()]',
  '    # brute force over pairs first, optimize once it passes',
  '    best = None',
  '    for i in range(len(values)):',
  '        for j in range(i + 1, len(values)):',
  '            # TODO: check the target condition here',
  '            pass',
  '    return str(best if best is not None else len(values))',
  '',
  'print(solve(sys.stdin.read()))',
].join('\n');

// The curated bank ships verified reference solutions — after the probe/offer captures, the
// staged candidate solves the assigned problem for real so the scorecard shows a passing run.
const BANK = JSON.parse(
  readFileSync(resolve(__dirname, '../../backend/src/interview/problems/bank.json'), 'utf-8')
) as { title: string; referencePython: string }[];
const SOLUTIONS = new Map(BANK.map((p) => [p.title.trim().toLowerCase(), p.referencePython]));

// The room's visible Run executes with EMPTY stdin (hidden tests get server-injected stdin), so a
// solution that reads input crashes in the console even when it grades 8/8. Guard the visible run:
// no stdin → exit clean; real stdin → feed it through untouched.
const robust = (src: string) =>
  [
    'import sys, io',
    '_raw = sys.stdin.read()',
    'if not _raw.strip():',
    '    raise SystemExit  # no console stdin — hidden tests supply real input',
    'sys.stdin = io.StringIO(_raw)',
    '',
  ].join('\n') + src;

// Route each probe to the answer that actually addresses it — a fixed rotation answers the wrong
// question when the interviewer's (dynamic) probe order differs, and scores as evasive.
const ANSWER_ROUTES: { match: RegExp; index: number }[] = [
  // Most-specific first: the crash-window follow-up must not fall through to the scaling answer.
  { match: /crash|redeliver|twice|duplicate|before committ|processed again|retry/i, index: 4 },
  { match: /atomic|transaction|fail|restart|exactly.once|consisten|guarantee/i, index: 1 },
  { match: /scale|10|traffic|grow|throughput|volume|partition/i, index: 2 },
  { match: /bug|incident|hard|debug|rebalance|wrong|challenge|worst/i, index: 3 },
];

async function answerOralAdaptively(room: CandidateRoom, maxTurns = 8): Promise<void> {
  const oralPhases = new Set(['greeting', 'oral', 'handoff', '']);
  const used = new Set<number>();
  for (let i = 0; i < maxTurns; i++) {
    const p = await room.phase();
    if (!oralPhases.has(p)) break;
    if (await room.isDone()) break;
    const q = await room.lastAiText();
    const routed = ANSWER_ROUTES.find((r) => r.match.test(q) && !used.has(r.index))?.index;
    const idx = routed ?? [1, 4, 2, 3, 0].find((n) => !used.has(n)) ?? 3; // fall back to any unused answer
    used.add(idx);
    await room.answer(ORAL_ANSWERS[idx]);
  }
}

// Staged candidates so the dashboard shot shows a believable pipeline, not test residue.
// Never emailed: interview creation doesn't notify, and every row is deleted after capture.
const DRIVER = { candidateName: 'Alex Rivera', candidateEmail: 'alex.rivera@meridianlabs.io' };
const SEEDS = [
  {
    candidateName: 'Sarah Chen',
    candidateEmail: 'sarah.chen@meridianlabs.io',
    language: 'typescript',
    level: 'senior',
  },
  {
    candidateName: 'Marcus Webb',
    candidateEmail: 'marcus.webb@arcadiahq.com',
    language: 'go',
    level: 'mid',
  },
  {
    candidateName: 'Priya Sharma',
    candidateEmail: 'priya.sharma@helioscale.com',
    language: 'python',
    level: 'senior',
  },
  {
    candidateName: 'Diego Álvarez',
    candidateEmail: 'diego.alvarez@nimbusworks.co',
    language: 'java',
    level: 'mid',
  },
  {
    candidateName: 'Elena Vasquez',
    candidateEmail: 'elena.vasquez@arcadiahq.com',
    language: 'python',
    level: 'senior',
  },
  {
    candidateName: 'Tom Okafor',
    candidateEmail: 'tom.okafor@helioscale.com',
    language: 'typescript',
    level: 'mid',
  },
  {
    candidateName: 'Mei Lin',
    candidateEmail: 'mei.lin@nimbusworks.co',
    language: 'go',
    level: 'senior',
  },
] as const;

let createdIds: string[] = [];
test.afterEach(async () => {
  for (const id of createdIds) await deleteInterview(id).catch(() => undefined);
  createdIds = [];
});

for (const theme of ['dark', 'light'] as const) {
  test(`capture ${theme} shots: oral, coding(+probe/+offer), invite(+dialog), score`, async ({
    browser,
  }) => {
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

    const interview = await createInterview({ language: 'python', level: 'mid', ...DRIVER });
    createdIds.push(interview.id);
    const room = new CandidateRoom(page);

    // ── oral ──
    await room.enter(interview.link);
    await room.waitForSettled();
    await room.answer(ORAL_ANSWERS[0]);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/oral-${theme}.png` });

    // ── coding + probe ──
    await answerOralAdaptively(room);
    await room.waitForCoding(30_000);
    await room.typeCode(WRONG_ATTEMPT);
    await room.run();
    await room.typeCode(WRONG_ATTEMPT.replace('# brute force', '# rework: brute force'));
    await room.run(); // second consecutive failure → the probe fires and shows in the chat
    await room.waitForAssist('probe', 25_000).catch(() => undefined);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/coding-${theme}.png` });

    // ── coding-active (hover pair): third failure → the hint OFFER moment ──
    await room.typeCode(WRONG_ATTEMPT.replace('# brute force', '# third pass: brute force'));
    await room.run();
    await room.waitForAssist('offer', 25_000).catch(() => undefined);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/coding-active-${theme}.png` });

    // ── solve it for real (bank reference), so the scorecard shows a passing candidate ──
    const title = (await room.problemTitle().catch(() => '')).trim().toLowerCase();
    const solution = SOLUTIONS.get(title);
    if (solution) {
      await room.typeCode(robust(solution));
      const final = await room.run();
      console.log(`[capture] final run (${title}): ${final.status}`);
    } else {
      console.log(`[capture] no bank solution matched title "${title}" — ending unsolved`);
    }

    // Conclude so scoring kicks off while we capture the dashboard.
    await page.getByRole('button', { name: 'End', exact: true }).click();
    await page.getByRole('button', { name: 'End interview' }).click();
    await page.waitForTimeout(1500);

    // Stage the pipeline: a handful of invited candidates so the table reads like a real team's.
    for (const seed of SEEDS) {
      const s = await createInterview(seed);
      createdIds.push(s.id);
    }

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
    // Wait for actual rows, not a timer — the dark run kept capturing the loading skeleton.
    await dash.getByText('Sarah Chen').first().waitFor({ timeout: 20_000 });
    await dash.waitForTimeout(800);
    await dash.screenshot({ path: `${OUT}/invite-${theme}.png` });

    // ── invite-active (hover pair): the create dialog open over the dashboard ──
    // The dev-mode toggle only exists for DEV_EMAILS accounts — hide it so the shot shows the
    // product a customer sees.
    await dash.addStyleTag({
      content: 'div[role="dialog"] label:has(input[type="checkbox"]) { display: none !important; }',
    });
    await dash.getByRole('button', { name: 'New interview' }).click();
    await dash.getByRole('dialog').waitFor({ state: 'visible', timeout: 5_000 });
    await dash.getByPlaceholder('candidate@example.com').fill('jordan.blake@meridianlabs.io');
    await dash.getByPlaceholder('Jane Smith').fill('Jordan Blake');
    await dash.waitForTimeout(400);
    await dash.screenshot({ path: `${OUT}/invite-active-${theme}.png` });
    await dash.keyboard.press('Escape');

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
