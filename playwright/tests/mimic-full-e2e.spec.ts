// Flagship: a real headed Chromium mimics a candidate through the entire interview — clears the
// camera/mic consent gate, answers the oral round by typing into the always-on composer (which
// drives the identical server FSM as voice), then in the coding round reads the assigned problem,
// writes code into CodeMirror, and RUNs it. Asserts the pipeline end-to-end and that hidden-test
// correctness never leaks to the candidate view.

import { test, expect } from '@playwright/test';
import { createInterview } from '../helpers/create-interview';
import { CandidateRoom } from '../helpers/room';

const ORAL_ANSWER =
  'Sure. I would start by clarifying the requirements and constraints, then sketch a couple of ' +
  'approaches with their time and space trade-offs, pick the simplest correct one, and validate ' +
  'it against edge cases before optimizing.';

// A safe generic attempt: reads stdin so it never errors on injected input, exits cleanly (so the
// candidate-facing RUN shows "Accepted"), but is wrong for the real problem — which drives the
// server-side hidden-test failures that the probe/hint policy reacts to.
const GENERIC_ATTEMPT = ['import sys', 'data = sys.stdin.read().split()', 'print(len(data))'].join(
  '\n'
);

test('candidate mimic: consent -> oral -> coding -> run, no hidden-test leak', async ({ page }) => {
  // The dev interview caps at ~2 min from begin; the mimic drives the interactive path then waits
  // out the cap to observe the terminal state — give the whole run generous headroom.
  test.setTimeout(220_000);
  const interview = await createInterview({ language: 'python', level: 'mid' });
  test.info().annotations.push({ type: 'interview', description: interview.id });
  const room = new CandidateRoom(page);

  // 1) Consent gate + landing.
  await room.enter(interview.link);
  await room.waitForSettled();
  expect(await room.aiCount(), 'interviewer should greet on entry').toBeGreaterThan(0);
  const greeting = await room.lastAiText();
  expect(greeting.length, 'greeting should be non-empty').toBeGreaterThan(10);
  console.log(`[greeting] ${greeting.slice(0, 120)}`);

  // 2) Oral round — answer until the FSM leaves the oral rounds.
  const turns = await room.advanceThroughOral(ORAL_ANSWER);
  console.log(`[oral] answered ${turns} turn(s); phase now = ${await room.phase()}`);
  await room.waitForCoding(30_000);
  expect(await room.isCoding(), 'should reach the coding phase after the oral round').toBeTruthy();

  // 3) Coding round — the assigned problem must be shown (statement, never hidden tests).
  const title = await room.problemTitle();
  console.log(`[coding] problem: ${title}`);
  expect(title.length).toBeGreaterThan(0);

  // 4) Write code + RUN. Two runs of a wrong-but-clean attempt exercise the sandbox and give the
  //    probe/hint policy (minFailures 2) a chance to fire.
  await room.typeCode(GENERIC_ATTEMPT);
  const r1 = await room.run();
  console.log(`[run 1] status=${r1.status}`);
  expect(r1.status.length, 'a run must report a status').toBeGreaterThan(0);

  await room.typeCode(GENERIC_ATTEMPT + '\n# retry');
  const r2 = await room.run();
  console.log(`[run 2] status=${r2.status}  hintFired=${await room.hintFired()}`);

  // 5) Hard invariant: the candidate view never shows hidden-test pass/fail.
  await room.assertNoHiddenTestLeak();

  // 6) Terminal: the interview concludes — either by completing the flow or by the dev time cap.
  await room.waitForDone(140_000);
  console.log(`[done] concludedByTime=${await room.concludedByTime()}`);
  expect(await room.isDone()).toBeTruthy();
});
