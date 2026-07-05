// Candidate-behavior matrix — drives the interviewer's probing/hinting design through the
// behaviors real candidates exhibit (research-grounded, 2026-07) and asserts the interviewer
// responds the way a good human would. Two suites:
//
//   1. "run-failure ladder + protections" (always runs): the Path-A ladder — quiet on run 1,
//      probe on the 2nd consecutive failure, stagnation-accelerated OFFER, deep hint only after
//      the offer, hard budget — plus decline-respect and clarifying-question handling.
//   2. "idle check-ins" (OF_IDLE_E2E=1 only): Path-B stuck-not-running behavior. Requires a
//      backend with IDLE_NUDGE_ENABLED=1 (run a local stack; prod keeps the flag OFF), so it is
//      opt-in via env. Asserts the check-in fires for a frozen candidate, is content-free, is
//      capped at one, and NEVER fires while the candidate is typing or chatting.
//
// Dev interviews compress the idle windows (room constants): idle window 20s, blank-editor floor
// 30s, poll 5s — so every row fits inside the 2-minute dev cap.

import { test, expect } from '@playwright/test';
import { createInterview, deleteInterview } from '../helpers/create-interview';
import { CandidateRoom } from '../helpers/room';

let createdId: string | null = null;
test.afterEach(async () => {
  if (createdId) await deleteInterview(createdId);
  createdId = null;
});

const ORAL_ANSWER =
  'Sure. I would start by clarifying the requirements and constraints, then sketch a couple of ' +
  'approaches with their time and space trade-offs, pick the simplest correct one, and validate ' +
  'it against edge cases before optimizing.';

// Wrong-but-clean attempt: reads stdin, exits 0 (candidate sees "Accepted"), fails the hidden
// tests identically every run → the maximally-stagnant candidate (same failure signature).
const WRONG_ATTEMPT = ['import sys', 'data = sys.stdin.read().split()', 'print(len(data))'].join(
  '\n'
);

// Dev-interview idle windows — MUST mirror the room's DEV_* constants in page.tsx.
const DEV_IDLE_WINDOW_MS = 20_000;
const DEV_BLANK_FLOOR_MS = 30_000;

/** Drive a fresh interview to the coding phase and return the room. */
async function reachCoding(page: import('@playwright/test').Page): Promise<CandidateRoom> {
  const interview = await createInterview({ language: 'python', level: 'mid' });
  createdId = interview.id;
  test.info().annotations.push({ type: 'interview', description: interview.id });
  const room = new CandidateRoom(page);
  await room.enter(interview.link);
  await room.waitForSettled();
  await room.advanceThroughOral(ORAL_ANSWER);
  await room.waitForCoding(30_000);
  return room;
}

test.describe('run-failure ladder + protections (Path A)', () => {
  test('stagnant thrash walks the ladder: quiet → probe → offer → hint → quiet (budget)', async ({
    page,
  }) => {
    test.setTimeout(220_000);
    const room = await reachCoding(page);
    await room.typeCode(WRONG_ATTEMPT);

    // Run 1 — a single failure is never jumpy.
    await room.run();
    expect(await room.assistKinds(), 'no intervention on the first failure').toEqual([]);

    // Run 2 — second consecutive identical failure → gentle Socratic probe.
    await room.typeCode(WRONG_ATTEMPT + '\n# r2');
    await room.run();
    await room.waitForAssist('probe', 20_000);
    expect(await room.assistCount('probe')).toBe(1);

    // Run 3 — SAME failure signature (stagnant) → the offer arrives without burning the full
    // cooldown: "want a bigger hint, or keep going?" — never the deep hint auto-injected.
    await room.typeCode(WRONG_ATTEMPT + '\n# r3');
    await room.run();
    await room.waitForAssist('offer', 20_000);
    expect(await room.assistCount('hint'), 'deep hint must NOT be auto-injected').toBe(0);

    // Run 4 — the candidate ignored the offer and kept failing → deliver the deep hint.
    await room.typeCode(WRONG_ATTEMPT + '\n# r4');
    await room.run();
    await room.waitForAssist('hint', 20_000);

    // Run 5 — budget spent → the interviewer goes quiet rather than nagging.
    await room.typeCode(WRONG_ATTEMPT + '\n# r5');
    await room.run();
    expect(await room.assistCount('hint'), 'never re-hints past the budget').toBe(1);
    expect(await room.assistCount('probe'), 'never re-probes past the budget').toBe(1);

    await room.assertNoHiddenTestLeak();
  });

  test('a DECLINED offer is respected: warm ack, then no hint no matter how much they fail', async ({
    page,
  }) => {
    test.setTimeout(220_000);
    const room = await reachCoding(page);
    await room.typeCode(WRONG_ATTEMPT);
    await room.run();
    await room.typeCode(WRONG_ATTEMPT + '\n# r2');
    await room.run(); // probe
    await room.typeCode(WRONG_ATTEMPT + '\n# r3');
    await room.run(); // offer (stagnation-accelerated)
    await room.waitForAssist('offer', 20_000);

    // Decline via the chat (the answer path resolves the offer without advancing the FSM).
    await room.answer('no thanks, let me keep trying');
    expect(await room.phase(), 'a decline must not advance the interview').toBe('coding');

    // Keep failing — the declined offer must keep the interviewer quiet (no deep hint, ever).
    await room.typeCode(WRONG_ATTEMPT + '\n# r4');
    await room.run();
    await room.typeCode(WRONG_ATTEMPT + '\n# r5');
    await room.run();
    expect(await room.assistCount('hint'), 'declined → the deep hint is never delivered').toBe(0);
  });

  test('an ACCEPTED offer delivers the deeper hint without advancing the question', async ({
    page,
  }) => {
    test.setTimeout(220_000);
    const room = await reachCoding(page);
    await room.typeCode(WRONG_ATTEMPT);
    await room.run();
    await room.typeCode(WRONG_ATTEMPT + '\n# r2');
    await room.run(); // probe
    await room.typeCode(WRONG_ATTEMPT + '\n# r3');
    await room.run(); // offer
    await room.waitForAssist('offer', 20_000);

    const problemBefore = await room.problemTitle();
    await room.answer('yes please');
    // The reply itself is the deep hint (rides the answer path; assist tag on the transcript turn).
    await room.waitForAssist('hint', 30_000);
    expect(await room.phase(), 'accepting a hint must not advance the interview').toBe('coding');
    expect(await room.problemTitle(), 'same problem stays in play').toBe(problemBefore);
    await room.assertNoHiddenTestLeak();
  });

  test('a clarifying question mid-coding gets answered without burning the question', async ({
    page,
  }) => {
    test.setTimeout(220_000);
    const room = await reachCoding(page);
    const problemBefore = await room.problemTitle();
    const before = await room.aiCount();
    await room.answer('Can I assume the input always fits in memory?');
    expect(await room.aiCount(), 'the interviewer replies to the question').toBeGreaterThan(before);
    expect(await room.phase(), 'a clarifying question must not advance the FSM').toBe('coding');
    expect(await room.problemTitle(), 'the coding problem is unchanged').toBe(problemBefore);
  });
});

// ── Path B: idle check-ins (requires IDLE_NUDGE_ENABLED=1 on the target backend) ──────────────
// Opt-in: OF_IDLE_E2E=1 npx playwright test behavior-matrix  (point OF_API_URL/OF_FRONTEND_URL at
// a stack whose backend has the flag on). Skipped otherwise — on prod the flag is OFF, which the
// first test of this suite asserts directly.

const IDLE_E2E = process.env.OF_IDLE_E2E === '1';

test.describe('stuck-not-running check-ins (Path B)', () => {
  test('flag OFF (default): a frozen candidate is left in peace — no nudge, ever', async ({
    page,
  }) => {
    test.skip(IDLE_E2E, 'this row asserts the DISABLED default; the enabled rows are below');
    test.setTimeout(220_000);
    const room = await reachCoding(page);
    // Freeze on the blank editor well past every window (dev floor 30s + idle 20s + poll 5s).
    await page.waitForTimeout(DEV_BLANK_FLOOR_MS + DEV_IDLE_WINDOW_MS + 15_000);
    expect(await room.assistCount('nudge'), 'server flag off → never a nudge').toBe(0);
  });

  test('blank-freeze: one content-free check-in, capped at one', async ({ page }) => {
    test.skip(!IDLE_E2E, 'requires IDLE_NUDGE_ENABLED=1 on the target backend (OF_IDLE_E2E=1)');
    test.setTimeout(220_000);
    const room = await reachCoding(page);

    // Do nothing. Past the blank floor + idle window the check-in should arrive.
    await room.waitForAssist('nudge', DEV_BLANK_FLOOR_MS + DEV_IDLE_WINDOW_MS + 25_000);
    const text = (await room.lastAssistText('nudge')).toLowerCase();
    // Content-free: nothing failed, so the check-in must not talk about bugs/tests/errors/fixes.
    for (const forbidden of ['bug', 'test', 'error', 'fix', 'wrong']) {
      expect(text, `idle check-in must be content-free (said "${forbidden}")`).not.toContain(
        forbidden
      );
    }

    // Keep idling — the per-question cap (1) must hold.
    await page.waitForTimeout(DEV_IDLE_WINDOW_MS + 15_000);
    expect(await room.assistCount('nudge'), 'idle check-ins are capped at one per question').toBe(
      1
    );
  });

  test('active typing is protected: a candidate who keeps writing is never nudged', async ({
    page,
  }) => {
    test.skip(!IDLE_E2E, 'requires IDLE_NUDGE_ENABLED=1 on the target backend (OF_IDLE_E2E=1)');
    test.setTimeout(220_000);
    const room = await reachCoding(page);
    // Type a line every ~8s (inside the 20s dev idle window) for ~45s of "slow but active" work.
    for (let i = 0; i < 6; i++) {
      await room.typeCode(`# thinking through step ${i}\n${WRONG_ATTEMPT}`);
      await page.waitForTimeout(8_000);
    }
    expect(await room.assistCount('nudge'), 'typing = engaged; no check-in may fire').toBe(0);
  });
});
