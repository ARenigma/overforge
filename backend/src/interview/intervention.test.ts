// Pure tests for the autonomous intervention engine (USP): the signal derivation and the
// balanced policy that decides IF/WHICH the interviewer steps in. No mocks — these are the
// subtle, control-critical rules, so they're tested in isolation.
//
// Ladder (per coding question): gentle PROBE (auto) → after a beat, OFFER a deeper hint (don't
// inject it) → the deep HINT is delivered only if the candidate keeps failing after the offer
// (they didn't decline). An accept/decline that arrives via the answer path is recorded as
// offerResolution and short-circuits the run path.

import { RunResult } from '../execution/types';
import { deriveRunSignals, runPassed } from './signals';
import {
  decideRunIntervention,
  deriveRunAssistBudget,
  classifyOfferResponse,
  RunAssistBudget,
} from './intervention';

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

const fail = (codeIndex: number) => run('Runtime Error', { codeIndex });
const probeRun = (codeIndex: number) =>
  run('Runtime Error', { codeIndex, intervention: { text: 'why is it failing?', kind: 'probe' } });
const offerRun = (codeIndex: number) =>
  run('Runtime Error', { codeIndex, intervention: { text: 'want a hint?', kind: 'offer' } });
const deepHintRun = (codeIndex: number) =>
  run('Runtime Error', { codeIndex, intervention: { text: 'check the boundary', kind: 'hint' } });

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
    expect(deriveRunSignals([fail(0), fail(0)], 1).consecutiveFailures).toBe(0);
  });

  test('the first question falls back to the whole log for legacy untagged runs (back-compat)', () => {
    expect(
      deriveRunSignals([run('Runtime Error'), run('Runtime Error')], 0).consecutiveFailures
    ).toBe(2);
  });
});

describe('deriveRunAssistBudget', () => {
  test('no prior interventions → all flags clear, no assist yet', () => {
    expect(deriveRunAssistBudget([fail(0), fail(0)], 0)).toEqual({
      probeGiven: false,
      offerMade: false,
      deepHintGiven: false,
      runsSinceLastAssist: Number.POSITIVE_INFINITY,
    });
  });

  test('a probe counts as an assist; runs-since is measured from it', () => {
    // f, probe, f → probeGiven; last assist at index 1 of 3 scoped runs → runsSince = 3 - 1 = 2.
    expect(deriveRunAssistBudget([fail(0), probeRun(0), fail(0)], 0)).toEqual({
      probeGiven: true,
      offerMade: false,
      deepHintGiven: false,
      runsSinceLastAssist: 2,
    });
  });

  test('an OFFER is a gate, not an assist — it sets offerMade but not the assist clock', () => {
    // probe(0) is the only assist (idx 0 of 3) → runsSince = 3 - 0 = 3; offer(idx 1) is not an assist.
    expect(deriveRunAssistBudget([probeRun(0), offerRun(0), fail(0)], 0)).toEqual({
      probeGiven: true,
      offerMade: true,
      deepHintGiven: false,
      runsSinceLastAssist: 3,
    });
  });

  test('a delivered deep hint sets deepHintGiven', () => {
    expect(deriveRunAssistBudget([probeRun(0), offerRun(0), deepHintRun(0)], 0)).toMatchObject({
      probeGiven: true,
      offerMade: true,
      deepHintGiven: true,
    });
  });

  test('scopes to the question — another question intervention does not count', () => {
    expect(deriveRunAssistBudget([probeRun(0), fail(1)], 1)).toEqual({
      probeGiven: false,
      offerMade: false,
      deepHintGiven: false,
      runsSinceLastAssist: Number.POSITIVE_INFINITY,
    });
  });
});

describe('decideRunIntervention (balanced ladder)', () => {
  const sig = (consecutiveFailures: number, lastRunPassed = false) => ({
    runsThisQuestion: consecutiveFailures,
    consecutiveFailures,
    lastStatus: lastRunPassed ? 'Accepted' : 'Runtime Error',
    lastRunPassed,
    hasErrorOutput: !lastRunPassed,
  });
  const budget = (o: Partial<RunAssistBudget> = {}): RunAssistBudget => ({
    probeGiven: false,
    offerMade: false,
    deepHintGiven: false,
    runsSinceLastAssist: Number.POSITIVE_INFINITY,
    ...o,
  });

  test('stays quiet outside the coding phase', () => {
    expect(decideRunIntervention(sig(3), 'oral', budget()).intervene).toBe(false);
  });

  test('stays quiet while the candidate is progressing (latest run passed)', () => {
    expect(decideRunIntervention(sig(0, true), 'coding', budget()).intervene).toBe(false);
  });

  test('does not fire on a single failure (not jumpy)', () => {
    expect(decideRunIntervention(sig(1), 'coding', budget()).intervene).toBe(false);
  });

  test('first intervention after 2 failures is a gentle probe (auto)', () => {
    expect(decideRunIntervention(sig(2), 'coding', budget())).toMatchObject({
      intervene: true,
      kind: 'probe',
      strength: 1,
    });
  });

  test('after the probe + a beat, it OFFERS a deeper hint (never auto-injects it)', () => {
    expect(
      decideRunIntervention(sig(3), 'coding', budget({ probeGiven: true, runsSinceLastAssist: 2 }))
    ).toMatchObject({ intervene: true, kind: 'offer', strength: 2 });
  });

  test('honors the cooldown before offering — no offer right on the heels of the probe', () => {
    expect(
      decideRunIntervention(sig(3), 'coding', budget({ probeGiven: true, runsSinceLastAssist: 1 }))
        .intervene
    ).toBe(false);
  });

  test('candidate ignored the offer + kept failing → deliver the deep hint', () => {
    expect(
      decideRunIntervention(sig(4), 'coding', budget({ probeGiven: true, offerMade: true }), 'none')
    ).toMatchObject({ intervene: true, kind: 'hint', strength: 2 });
  });

  test('candidate DECLINED the offer → stay quiet (no hint, respect their choice)', () => {
    expect(
      decideRunIntervention(
        sig(5),
        'coding',
        budget({ probeGiven: true, offerMade: true }),
        'declined'
      ).intervene
    ).toBe(false);
  });

  test('deep hint already delivered via the answer path (hinted) → stay quiet', () => {
    expect(
      decideRunIntervention(
        sig(5),
        'coding',
        budget({ probeGiven: true, offerMade: true }),
        'hinted'
      ).intervene
    ).toBe(false);
  });

  test('deep hint already delivered via the run path → never re-hint', () => {
    expect(
      decideRunIntervention(
        sig(5),
        'coding',
        budget({ probeGiven: true, offerMade: true, deepHintGiven: true }),
        'none'
      ).intervene
    ).toBe(false);
  });
});

describe('classifyOfferResponse', () => {
  test.each(['yes', 'yes please', 'sure', 'ok', 'a hint would help', 'go ahead', 'give me a hint'])(
    'accepts: %s',
    (t) => expect(classifyOfferResponse(t)).toBe('accept')
  );
  test.each(['no', 'nope', 'no thanks', 'keep going', "i'm good", 'let me try', 'no hint'])(
    'declines: %s',
    (t) => expect(classifyOfferResponse(t)).toBe('decline')
  );
  test.each(['can I assume the input is sorted?', 'I think it is an off-by-one', ''])(
    'other: %s',
    (t) => expect(classifyOfferResponse(t)).toBe('other')
  );
});
