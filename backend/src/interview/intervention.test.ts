// Pure tests for the autonomous intervention engine (USP): the signal derivation and the
// balanced policy that decides IF/WHICH the interviewer steps in. No mocks — these are the
// subtle, control-critical rules, so they're tested in isolation.

import { RunResult } from '../execution/types';
import { deriveRunSignals, runPassed } from './signals';
import { decideRunIntervention, deriveRunAssistBudget, BALANCED_RUN_POLICY } from './intervention';

function run(status: string, opts: Partial<RunResult> = {}): RunResult {
  return {
    stdout: '',
    stderr: status === 'Accepted' ? '' : 'boom',
    compileOutput: '',
    status,
    exitCode: status === 'Accepted' ? 0 : 1,
    timeMs: 5,
    memoryKb: null,
    ...opts,
  };
}

const hint = (codeIndex: number) =>
  run('Runtime Error', { codeIndex, intervention: { text: 'try the boundary', kind: 'probe' } });
const fail = (codeIndex: number) => run('Runtime Error', { codeIndex });

describe('runPassed', () => {
  test('Accepted with clean exit + no stderr is a pass', () => {
    expect(runPassed(run('Accepted'))).toBe(true);
  });
  test('Accepted but stderr present is NOT a pass', () => {
    expect(runPassed(run('Accepted', { stderr: 'warning: ...' }))).toBe(false);
  });
  test('Runtime Error is a failure', () => {
    expect(runPassed(run('Runtime Error'))).toBe(false);
  });
});

describe('deriveRunSignals', () => {
  test('empty run log is quiet (no pass, no failures)', () => {
    const s = deriveRunSignals([], 0);
    expect(s).toMatchObject({ runsThisQuestion: 0, consecutiveFailures: 0, lastRunPassed: false });
  });

  test('counts trailing consecutive failures for the current question', () => {
    const s = deriveRunSignals([run('Accepted', { codeIndex: 0 }), fail(0), fail(0)], 0);
    expect(s.consecutiveFailures).toBe(2);
    expect(s.lastRunPassed).toBe(false);
    expect(s.hasErrorOutput).toBe(true);
  });

  test('a passing latest run resets the streak (progress)', () => {
    const s = deriveRunSignals([fail(0), fail(0), run('Accepted', { codeIndex: 0 })], 0);
    expect(s.consecutiveFailures).toBe(0);
    expect(s.lastRunPassed).toBe(true);
  });

  test('scopes to the current coding question when runs are tagged', () => {
    const runs = [fail(0), fail(0), fail(1)];
    expect(deriveRunSignals(runs, 1).consecutiveFailures).toBe(1);
    expect(deriveRunSignals(runs, 0).consecutiveFailures).toBe(2);
  });

  test('a later question does NOT inherit an earlier question failure streak', () => {
    // Question 1 has no tagged runs yet — must read as zero, not fall back to question 0's fails.
    expect(deriveRunSignals([fail(0), fail(0)], 1).consecutiveFailures).toBe(0);
  });

  test('the first question falls back to the whole log for legacy untagged runs (back-compat)', () => {
    expect(
      deriveRunSignals([run('Runtime Error'), run('Runtime Error')], 0).consecutiveFailures
    ).toBe(2);
  });
});

describe('deriveRunAssistBudget', () => {
  test('no prior hints → nothing given, cooldown clear', () => {
    expect(deriveRunAssistBudget([fail(0), fail(0)], 0)).toEqual({
      given: 0,
      runsSinceLastHint: Number.POSITIVE_INFINITY,
    });
  });

  test('counts hints given and runs since the last hint (this question)', () => {
    // f, hint, f → 1 given; last hint at index 1 of 3 scoped runs → runsSince = 3 - 1 = 2.
    expect(deriveRunAssistBudget([fail(0), hint(0), fail(0)], 0)).toEqual({
      given: 1,
      runsSinceLastHint: 2,
    });
  });

  test('scopes to the question — another question hint does not count', () => {
    expect(deriveRunAssistBudget([hint(0), fail(1)], 1)).toEqual({
      given: 0,
      runsSinceLastHint: Number.POSITIVE_INFINITY,
    });
  });
});

describe('decideRunIntervention (balanced)', () => {
  const sig = (consecutiveFailures: number, lastRunPassed = false) => ({
    runsThisQuestion: consecutiveFailures,
    consecutiveFailures,
    lastStatus: lastRunPassed ? 'Accepted' : 'Runtime Error',
    lastRunPassed,
    hasErrorOutput: !lastRunPassed,
  });
  const FRESH = { given: 0, runsSinceLastHint: Number.POSITIVE_INFINITY };

  test('stays quiet outside the coding phase', () => {
    expect(decideRunIntervention(sig(3), 'oral', FRESH).intervene).toBe(false);
  });

  test('stays quiet while the candidate is progressing (latest run passed)', () => {
    expect(decideRunIntervention(sig(0, true), 'coding', FRESH).intervene).toBe(false);
  });

  test('does not fire on a single failure (not jumpy)', () => {
    expect(decideRunIntervention(sig(1), 'coding', FRESH).intervene).toBe(false);
  });

  test('first intervention after 2 consecutive failures is a gentle probe', () => {
    expect(decideRunIntervention(sig(2), 'coding', FRESH)).toMatchObject({
      intervene: true,
      kind: 'probe',
      strength: 1,
    });
  });

  test('escalates to a concrete hint on continued failure (cooldown satisfied)', () => {
    expect(
      decideRunIntervention(sig(3), 'coding', { given: 1, runsSinceLastHint: 2 })
    ).toMatchObject({
      intervene: true,
      kind: 'hint',
      strength: 2,
    });
  });

  test('honors the cooldown — no two hints within cooldownRuns', () => {
    expect(
      decideRunIntervention(sig(3), 'coding', { given: 1, runsSinceLastHint: 1 }).intervene
    ).toBe(false);
  });

  test('honors the per-question budget — never nags', () => {
    expect(
      decideRunIntervention(sig(5), 'coding', {
        given: BALANCED_RUN_POLICY.maxPerQuestion,
        runsSinceLastHint: 9,
      }).intervene
    ).toBe(false);
  });

  test('the first hint is not blocked by the cooldown (no prior hint)', () => {
    expect(decideRunIntervention(sig(2), 'coding', FRESH).intervene).toBe(true);
  });
});
