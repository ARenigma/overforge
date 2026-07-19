// Acceptance for the coding-round redesign (docs/CODING_ROUND_REDESIGN.md §5). Drives the REAL
// Run/Submit/Move-on controls and asserts the product mandate at the UI+server boundary: every code
// SUBMIT fires a counter-question before advancing; MOVE-ON advances with none. Runs in the 'mimic'
// project (headed Chromium through the camera+mic-gated room).

import { test, expect } from '@playwright/test';
import { createInterview, deleteInterview } from '../helpers/create-interview';
import { CandidateRoom } from '../helpers/room';

// A correct-ish Python solution with a distinctive function name so the (deterministic-fallback)
// counter-question can be shown to anchor on the SUBMITTED code.
const SOLUTION =
  'import sys\n\ndef reconcile(nums):\n    return sum(nums)\n\nprint(reconcile([1, 2, 3]))\n';

const ORAL = [
  'I built a payments reconciliation service in Python on FastAPI with an idempotency-key table.',
  'Out-of-order webhooks were the hard part; a per-payment state machine reordered them safely.',
  'A hash map gives O(1) average lookups; load factor and resizing govern collisions.',
  'Happy to move on to the coding part.',
];

let createdId: string | null = null;
test.afterEach(async () => {
  if (createdId && !process.env.KEEP_INTERVIEW) await deleteInterview(createdId);
  createdId = null;
});

test.describe('coding controls: Run / Submit / Move-on', () => {
  test('SUBMIT fires a counter-question and stays on the problem; answering it advances', async ({
    page,
  }) => {
    const interview = await createInterview({ language: 'python', level: 'mid' });
    createdId = interview.id;
    const room = new CandidateRoom(page);
    await room.enter(interview.link);
    await room.waitForSettled();
    await room.advanceThroughOral(ORAL);
    await room.waitForCoding(60_000);

    const cqBefore = await room.assistCount('counter_question');
    await room.submitSolution(SOLUTION);

    // The mandate: a counter-question appeared…
    expect(await room.assistCount('counter_question'), 'SUBMIT must fire a counter-question').toBe(
      cqBefore + 1
    );
    // …and we did NOT advance (still coding, problem panel still visible), and no hidden-test leak.
    expect(await room.isCoding()).toBe(true);
    await room.assertNoHiddenTestLeak();

    // Answering the counter-question substantively advances the interview (problem 2 or wrap-up).
    await room.answer(
      'It is O(n) time and O(1) space; on empty input sum returns 0, which is the correct identity.'
    );
    expect(await room.isDone()).toBe(false);
  });

  test('MOVE-ON advances with no counter-question', async ({ page }) => {
    const interview = await createInterview({ language: 'python', level: 'mid' });
    createdId = interview.id;
    const room = new CandidateRoom(page);
    await room.enter(interview.link);
    await room.waitForSettled();
    await room.advanceThroughOral(ORAL);
    await room.waitForCoding(60_000);

    const cqBefore = await room.assistCount('counter_question');
    await room.moveOn();
    // No new counter-question from a firm skip.
    expect(await room.assistCount('counter_question')).toBe(cqBefore);
    await room.assertNoHiddenTestLeak();
  });
});
