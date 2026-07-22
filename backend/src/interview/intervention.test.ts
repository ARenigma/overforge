// Pure tests for the autonomous intervention engine (USP): the signal derivation and the
// balanced policy that decides IF/WHICH the interviewer steps in. No mocks — these are the
// subtle, control-critical rules, so they're tested in isolation.
//
// Ladder (per coding question): gentle PROBE (auto) → after a beat, OFFER a deeper hint (don't
// inject it) → the deep HINT is delivered only if the candidate keeps failing after the offer
// (they didn't decline). An accept/decline that arrives via the answer path is recorded as
// offerResolution and short-circuits the run path.

import { RunResult } from '../execution/types';
import { TestResults } from './types';
import { deriveRunSignals, runPassed, idleNudgesGiven } from './signals';
import {
  decideRunIntervention,
  deriveRunAssistBudget,
  classifyOfferResponse,
  decideIdleIntervention,
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
/** A wrong-but-clean run that passed `passed`/`total` hidden tests (a "failure" until all green). */
const tested = (codeIndex: number, passed: number, total: number, cases?: TestResults['cases']) =>
  run(passed === total ? 'Accepted' : 'Runtime Error', {
    codeIndex,
    testResults: { passed, total, ...(cases ? { cases } : {}) },
  });
/** A synthetic idle-nudge marker on the code-run channel (Path B). */
const idle = (codeIndex: number) =>
  run('Idle', {
    codeIndex,
    exitCode: null,
    stderr: '',
    intervention: { text: 'take your time', kind: 'nudge' },
  });
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

  test('passedProgress is true when the latest failing run improves the pass count', () => {
    const s = deriveRunSignals([tested(0, 1, 5), tested(0, 3, 5)], 0);
    expect(s.passedProgress).toBe(true);
    expect(s.consecutiveFailures).toBe(2);
  });

  test('passedProgress is false when the pass count does not improve (plateau)', () => {
    expect(deriveRunSignals([tested(0, 3, 5), tested(0, 3, 5)], 0).passedProgress).toBe(false);
  });

  test('stagnant is true when the two latest failing runs share a signature', () => {
    const c = [
      { index: 0, passed: true },
      { index: 1, passed: false },
    ];
    expect(deriveRunSignals([tested(0, 1, 2, c), tested(0, 1, 2, c)], 0).stagnant).toBe(true);
  });

  test('stagnant is false when the failing signature changes (still iterating)', () => {
    const c1 = [
      { index: 0, passed: false },
      { index: 1, passed: true },
    ];
    const c2 = [
      { index: 0, passed: true },
      { index: 1, passed: false },
    ];
    expect(deriveRunSignals([tested(0, 1, 2, c1), tested(0, 1, 2, c2)], 0).stagnant).toBe(false);
  });

  test('idle markers are EXCLUDED from real-run signals (no phantom failure)', () => {
    // A passing run then an idle marker: the streak stays 0 and the last real run still "passed".
    const s = deriveRunSignals([run('Accepted', { codeIndex: 0 }), idle(0)], 0);
    expect(s.consecutiveFailures).toBe(0);
    expect(s.lastRunPassed).toBe(true);
    expect(s.runsThisQuestion).toBe(1); // idle not counted as a run
  });

  test('idle markers do not break a real failure streak', () => {
    expect(deriveRunSignals([fail(0), idle(0), fail(0)], 0).consecutiveFailures).toBe(2);
  });
});

describe('idleNudgesGiven', () => {
  test('counts only idle markers scoped to the question', () => {
    expect(idleNudgesGiven([idle(0), fail(0), idle(0), idle(1)], 0)).toBe(2);
    expect(idleNudgesGiven([idle(0), idle(1)], 1)).toBe(1);
    expect(idleNudgesGiven([fail(0), fail(0)], 0)).toBe(0);
  });
});

describe('decideIdleIntervention (Path B — stuck-not-running)', () => {
  const idleSig = (o: Partial<Parameters<typeof decideIdleIntervention>[0]> = {}) => ({
    phase: 'coding',
    codeLength: 0,
    idleNudgesGiven: 0,
    offerResolution: 'none' as const,
    lastRealRunPassed: false,
    pendingOffer: false,
    ...o,
  });

  test('blank editor → a gentle nudge in blank mode', () => {
    expect(decideIdleIntervention(idleSig({ codeLength: 0 }))).toMatchObject({
      intervene: true,
      kind: 'nudge',
      strength: 1,
      mode: 'blank',
    });
  });

  test('partial code → a gentle nudge in partial mode', () => {
    expect(decideIdleIntervention(idleSig({ codeLength: 120 }))).toMatchObject({
      intervene: true,
      mode: 'partial',
    });
  });

  test('never fires outside the coding phase', () => {
    expect(decideIdleIntervention(idleSig({ phase: 'oral' })).intervene).toBe(false);
  });

  test('caps at one idle nudge per question', () => {
    expect(decideIdleIntervention(idleSig({ idleNudgesGiven: 1 })).intervene).toBe(false);
  });

  test('stays quiet if the candidate already declined a hint offer', () => {
    expect(decideIdleIntervention(idleSig({ offerResolution: 'declined' })).intervene).toBe(false);
  });

  test('stays quiet while our own hint OFFER is awaiting a reply (never talks over it)', () => {
    expect(decideIdleIntervention(idleSig({ pendingOffer: true })).intervene).toBe(false);
  });

  test('stays quiet once the deep hint was already given', () => {
    expect(decideIdleIntervention(idleSig({ offerResolution: 'hinted' })).intervene).toBe(false);
  });

  test('stays quiet if the candidate already solved it (last real run passed)', () => {
    expect(decideIdleIntervention(idleSig({ lastRealRunPassed: true })).intervene).toBe(false);
  });

  test('NEVER escalates beyond a nudge — no probe/offer/hint from idle', () => {
    const d = decideIdleIntervention(idleSig({ codeLength: 500, idleNudgesGiven: 0 }));
    expect(d.kind).toBe('nudge');
    expect(d.strength).toBeLessThanOrEqual(1);
  });
});

describe('deriveRunAssistBudget', () => {
  test('no prior interventions → all flags clear, no assist yet', () => {
    expect(deriveRunAssistBudget([fail(0), fail(0)], 0)).toEqual({
      probeGiven: false,
      offerMade: false,
      deepHintGiven: false,
      encourageGiven: false,
      runsSinceLastAssist: Number.POSITIVE_INFINITY,
      consecutiveFailuresBeforeLatest: 2,
    });
  });

  test('a probe counts as an assist; runs-since is measured from it', () => {
    // f, probe, f → probeGiven; last assist at index 1 of 3 scoped runs → runsSince = 3 - 1 = 2.
    expect(deriveRunAssistBudget([fail(0), probeRun(0), fail(0)], 0)).toEqual({
      probeGiven: true,
      offerMade: false,
      deepHintGiven: false,
      encourageGiven: false,
      runsSinceLastAssist: 2,
      consecutiveFailuresBeforeLatest: 3,
    });
  });

  test('an OFFER is a gate, not an assist — it sets offerMade but not the assist clock', () => {
    // probe(0) is the only assist (idx 0 of 3) → runsSince = 3 - 0 = 3; offer(idx 1) is not an assist.
    expect(deriveRunAssistBudget([probeRun(0), offerRun(0), fail(0)], 0)).toEqual({
      probeGiven: true,
      offerMade: true,
      deepHintGiven: false,
      encourageGiven: false,
      runsSinceLastAssist: 3,
      consecutiveFailuresBeforeLatest: 3,
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
      encourageGiven: false,
      runsSinceLastAssist: Number.POSITIVE_INFINITY,
      consecutiveFailuresBeforeLatest: 1,
    });
  });
});

describe('decideRunIntervention (balanced ladder)', () => {
  const sig = (
    consecutiveFailures: number,
    lastRunPassed = false,
    extra: { passedProgress?: boolean; stagnant?: boolean } = {}
  ) => ({
    runsThisQuestion: consecutiveFailures,
    consecutiveFailures,
    lastStatus: lastRunPassed ? 'Accepted' : 'Runtime Error',
    lastRunPassed,
    hasErrorOutput: !lastRunPassed,
    passedProgress: extra.passedProgress ?? false,
    stagnant: extra.stagnant ?? false,
  });
  const budget = (o: Partial<RunAssistBudget> = {}): RunAssistBudget => ({
    probeGiven: false,
    offerMade: false,
    deepHintGiven: false,
    encourageGiven: false,
    runsSinceLastAssist: Number.POSITIVE_INFINITY,
    consecutiveFailuresBeforeLatest: 0,
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

  test('forward progress DEFERS the probe (exploratory runner improving pass count)', () => {
    // 2 failures would normally probe, but the latest run improved the passing-test count.
    expect(
      decideRunIntervention(sig(2, false, { passedProgress: true }), 'coding', budget()).intervene
    ).toBe(false);
  });

  test('stagnation ESCALATES to the offer even inside the cooldown window', () => {
    // Same failing signature run after run → skip the cooldown wait and offer the deeper hint.
    expect(
      decideRunIntervention(
        sig(3, false, { stagnant: true }),
        'coding',
        budget({ probeGiven: true, runsSinceLastAssist: 1 })
      )
    ).toMatchObject({ intervene: true, kind: 'offer' });
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
