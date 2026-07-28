// Approach-first gate + Milestone probe — unit tests.
//
// Feature 1: Approach-first gate (ENGAGEMENT_INTERVENTIONS)
//   - decideApproachGate pure function guards.
//   - Machine state: codeApproachDone resets on advanceCoding / handoff→coding.
//   - Mandatory SUBMIT counter-question still fires when approach gate preceded it.
//
// Feature 2: Milestone probe (ENGAGEMENT_INTERVENTIONS, Path C)
//   - decideMilestoneProbe pure function guards.
//   - hasMilestoneStructure structural detection.
//   - ingestSnapshot returns milestoneCrossed exactly once per codeIndex.

import { RunResult } from '../execution/types';
import {
  decideApproachGate,
  decideMilestoneProbe,
  decideRunIntervention,
  deriveRunAssistBudget,
  RunAssistBudget,
} from './intervention';
import { hasMilestoneStructure, ingestSnapshot, evictEngagement } from './engagement';
import { advance, initialContext } from './machine';
import { InterviewContext, InterviewEvent } from './types';
import { isSyntheticRow } from './signals';

// ─────────────────────── Fixtures ───────────────────────

function run(status: string, codeIndex = 0, opts: Partial<RunResult> = {}): RunResult {
  return {
    stdout: '',
    stderr: status === 'Accepted' ? '' : 'boom',
    compileOutput: '',
    status,
    exitCode: status === 'Accepted' ? 0 : 1,
    timeMs: 10,
    memoryKb: null,
    codeIndex,
    ...opts,
  };
}

const fail = (codeIndex = 0) => run('Runtime Error', codeIndex);

function makeBudget(overrides: Partial<RunAssistBudget> = {}): RunAssistBudget {
  return {
    probeGiven: false,
    offerMade: false,
    deepHintGiven: false,
    encourageGiven: false,
    runsSinceLastAssist: Infinity,
    consecutiveFailuresBeforeLatest: 0,
    ...overrides,
  };
}

const baseMilestoneOpts = {
  phase: 'coding',
  engagementState: 'FLOWING' as const,
  budget: makeBudget(),
  isRunInFlight: false,
  isAnswerInFlight: false,
  cooldownOk: true,
};

/** Drive to the start of coding phase (phase='coding', codeIndex=0, followUps=0). */
function toCoding(): InterviewContext {
  let ctx = initialContext();
  for (const ev of [
    { type: 'start' } as InterviewEvent,
    { type: 'answer' } as InterviewEvent, // greeting → ask_oral(0)
    { type: 'answer' } as InterviewEvent, // oral → ask_oral(1)
    { type: 'answer' } as InterviewEvent, // oral → handoff
    { type: 'answer' } as InterviewEvent, // handoff → ask_code(0)
  ]) {
    ctx = advance(ctx, ev).ctx;
  }
  return ctx;
}

// ─────────────────────── Feature 1: decideApproachGate ───────────────────────

describe('decideApproachGate — pure function', () => {
  const base = {
    phase: 'coding',
    intent: undefined as 'submit' | 'move_on' | 'answer' | undefined,
    codeApproachDone: false,
    realRunCount: 0,
    engagementEnabled: true,
  };

  test('fires on first answer in coding with no runs', () => {
    expect(decideApproachGate(base).gate).toBe(true);
  });

  test('silent when engagement flag is off', () => {
    expect(decideApproachGate({ ...base, engagementEnabled: false }).gate).toBe(false);
  });

  test('silent when phase is not coding', () => {
    expect(decideApproachGate({ ...base, phase: 'oral' }).gate).toBe(false);
  });

  test('silent on submit intent', () => {
    expect(decideApproachGate({ ...base, intent: 'submit' }).gate).toBe(false);
  });

  test('silent on move_on intent', () => {
    expect(decideApproachGate({ ...base, intent: 'move_on' }).gate).toBe(false);
  });

  test('silent when codeApproachDone is true (already handled)', () => {
    expect(decideApproachGate({ ...base, codeApproachDone: true }).gate).toBe(false);
  });

  test('silent when a real run already logged (implicit close)', () => {
    expect(decideApproachGate({ ...base, realRunCount: 1 }).gate).toBe(false);
  });

  test('silent when approach is undefined (treated as false) and runs exist', () => {
    // undefined approach + 1 run → gate closed via realRunCount
    expect(decideApproachGate({ ...base, codeApproachDone: undefined, realRunCount: 1 }).gate).toBe(false);
  });
});

// ─────────────────────── Feature 1: Machine state — codeApproachDone ───────────────────────

describe('machine: codeApproachDone lifecycle', () => {
  test('initial ctx has codeApproachDone=false (set on handoff→coding transition)', () => {
    const ctx = toCoding();
    expect(ctx.codeApproachDone).toBe(false);
  });

  test('advanceCoding (via move_on) resets codeApproachDone=false for next problem', () => {
    let ctx = toCoding();
    // Manually set codeApproachDone=true (simulating approach was done)
    ctx = { ...ctx, codeApproachDone: true };
    // move_on → advanceCoding
    const { ctx: next } = advance(ctx, { type: 'answer', intent: 'move_on' });
    expect(next.codeIndex).toBe(1);
    expect(next.codeApproachDone).toBe(false);
  });

  test('advanceCoding (via answer after cap) resets codeApproachDone=false', () => {
    let ctx = toCoding();
    ctx = { ...ctx, codeApproachDone: true };
    // Drive to advance without more follow-ups (followUps already at cap)
    ctx = { ...ctx, followUps: 2 }; // cap (codeMaxFollowUps=2)
    const { ctx: next, effect } = advance(ctx, { type: 'answer' });
    expect(effect.kind).toBe('ask_code');
    expect(next.codeApproachDone).toBe(false);
  });

  test('mandatory SUBMIT counter-question still fires when followUps=0 (approach gate does not increment followUps)', () => {
    // Simulate: approach handled in orchestrator (codeApproachDone=true, followUps=0 unchanged)
    let ctx = toCoding();
    ctx = { ...ctx, codeApproachDone: true, followUps: 0 };
    const { effect } = advance(ctx, { type: 'answer', intent: 'submit' });
    expect(effect.kind).toBe('ask_followup');
    expect((effect as { mandatory?: boolean }).mandatory).toBe(true);
  });

  test('after approach CQ (no followUps increment), subsequent submit fires mandatory CQ', () => {
    // Candidate: approach verbally → approach CQ answered → submit
    let ctx = toCoding();
    // Approach done, no followUps from approach gate
    ctx = { ...ctx, codeApproachDone: true, followUps: 0 };
    // Submit fires mandatory CQ
    const { ctx: after, effect } = advance(ctx, { type: 'answer', intent: 'submit' });
    expect(effect).toEqual({ kind: 'ask_followup', codeIndex: 0, depth: 1, mandatory: true });
    expect(after.followUps).toBe(1);
  });

  test('per-problem reset: codeApproachDone=false after advancing to problem 1', () => {
    let ctx = toCoding();
    // Complete problem 0 (submit → mandatory CQ → answer → next problem)
    ctx = advance(ctx, { type: 'answer', intent: 'submit' }).ctx; // CQ at depth=1
    ctx = advance(ctx, { type: 'answer' }).ctx; // answer CQ → advance (followUps=1 → cap logic)
    // Now at problem 1
    expect(ctx.codeIndex).toBe(1);
    expect(ctx.codeApproachDone).toBe(false);
  });
});

// ─────────────────────── Feature 2: hasMilestoneStructure ───────────────────────

describe('hasMilestoneStructure', () => {
  test('returns false for empty string', () => {
    expect(hasMilestoneStructure('')).toBe(false);
  });

  test('returns false for short code (<30 chars)', () => {
    expect(hasMilestoneStructure('x = 1')).toBe(false);
  });

  test('returns true for Python function definition', () => {
    const code = 'def two_sum(nums, target):\n    pass\n';
    expect(hasMilestoneStructure(code)).toBe(true);
  });

  test('returns true for JavaScript function', () => {
    const code = 'function twoSum(nums, target) {\n    return [];\n}';
    expect(hasMilestoneStructure(code)).toBe(true);
  });

  test('returns true for Go func', () => {
    const code = 'func twoSum(nums []int, target int) []int {\n    return nil\n}';
    expect(hasMilestoneStructure(code)).toBe(true);
  });

  test('returns true for Rust fn', () => {
    const code = 'fn two_sum(nums: Vec<i32>, target: i32) -> Vec<i32> {\n    vec![]\n}';
    expect(hasMilestoneStructure(code)).toBe(true);
  });

  test('returns true for a for loop', () => {
    const code = 'for i in range(len(nums)):\n    result.append(i)\n';
    expect(hasMilestoneStructure(code)).toBe(true);
  });

  test('returns true for a while loop', () => {
    const code = 'left, right = 0, len(nums) - 1\nwhile left < right:\n    left += 1\n';
    expect(hasMilestoneStructure(code)).toBe(true);
  });

  test('returns true for hash map usage (new Map)', () => {
    const code = 'const seen = new Map();\nseen.set(val, idx);\nreturn seen.get(comp);\n';
    expect(hasMilestoneStructure(code)).toBe(true);
  });

  test('returns true for Python dict()', () => {
    const code = 'seen = dict()\nfor i, v in enumerate(nums):\n    pass\n';
    expect(hasMilestoneStructure(code)).toBe(true);
  });

  test('returns false for plain variable assignment without structure', () => {
    // 30+ chars but no function/loop/data-structure
    const code = 'result = []\n# initializing the result array here\n';
    expect(hasMilestoneStructure(code)).toBe(false);
  });
});

// ─────────────────────── Feature 2: ingestSnapshot milestoneCrossed ───────────────────────

describe('ingestSnapshot — milestoneCrossed signal', () => {
  const id = 'milestone-snapshot-test';

  beforeEach(() => {
    evictEngagement(id);
  });

  test('returns milestoneCrossed=false for code without structure', () => {
    const result = ingestSnapshot(id, { codeIndex: 0, code: 'x = 1\n# short' });
    expect(result.accepted).toBe(true);
    expect(result.milestoneCrossed).toBe(false);
  });

  test('returns milestoneCrossed=true the first time structured code is seen', () => {
    // First snapshot: plain
    ingestSnapshot(id, { codeIndex: 0, code: '# planning...\n' });
    // Second snapshot: has a function
    const r = ingestSnapshot(id, {
      codeIndex: 0,
      code: 'def solution(nums, target):\n    seen = {}\n    for i, v in enumerate(nums):\n        return []\n',
    });
    expect(r.accepted).toBe(true);
    expect(r.milestoneCrossed).toBe(true);
  });

  test('milestoneCrossed=false on the SECOND snapshot with structure (already crossed)', () => {
    const structured = 'def solve(n):\n    for i in range(n):\n        pass\n';
    ingestSnapshot(id, { codeIndex: 0, code: structured }); // first → milestoneCrossed
    const r = ingestSnapshot(id, { seq: 2, codeIndex: 0, code: structured + '    x = 1\n' });
    expect(r.milestoneCrossed).toBe(false); // already crossed — not signalled again
  });

  test('milestoneCrossed resets when codeIndex changes', () => {
    // Cross milestone on problem 0
    ingestSnapshot(id, {
      codeIndex: 0,
      code: 'def solve(n):\n    for i in range(n): pass\n',
    });
    // Advance to problem 1 — buffer resets
    const r = ingestSnapshot(id, {
      codeIndex: 1,
      code: 'def solve2(n):\n    while n > 0: n -= 1\n',
    });
    // First structured snapshot on problem 1 → milestone crossed again
    expect(r.accepted).toBe(true);
    expect(r.milestoneCrossed).toBe(true);
  });

  test('stale seq returns accepted=false and milestoneCrossed=false', () => {
    ingestSnapshot(id, { seq: 5, codeIndex: 0, code: '# hello\n' });
    const r = ingestSnapshot(id, { seq: 4, codeIndex: 0, code: 'def f(): pass\n' });
    expect(r.accepted).toBe(false);
    expect(r.milestoneCrossed).toBe(false);
  });
});

// ─────────────────────── Feature 2: decideMilestoneProbe ───────────────────────

describe('decideMilestoneProbe — pure function', () => {
  test('fires on FLOWING with no prior interventions', () => {
    const d = decideMilestoneProbe(baseMilestoneOpts);
    expect(d.intervene).toBe(true);
  });

  test('fires on STRUGGLING_PRODUCTIVE with no prior interventions', () => {
    const d = decideMilestoneProbe({ ...baseMilestoneOpts, engagementState: 'STRUGGLING_PRODUCTIVE' });
    expect(d.intervene).toBe(true);
  });

  test('silent on THINKING state', () => {
    const d = decideMilestoneProbe({ ...baseMilestoneOpts, engagementState: 'THINKING' });
    expect(d.intervene).toBe(false);
  });

  test('silent on DEGRADING state', () => {
    const d = decideMilestoneProbe({ ...baseMilestoneOpts, engagementState: 'DEGRADING' });
    expect(d.intervene).toBe(false);
  });

  test('silent on WHEEL_SPINNING state', () => {
    const d = decideMilestoneProbe({ ...baseMilestoneOpts, engagementState: 'WHEEL_SPINNING' });
    expect(d.intervene).toBe(false);
  });

  test('silent on null engagement state (cold buffer)', () => {
    const d = decideMilestoneProbe({ ...baseMilestoneOpts, engagementState: null });
    expect(d.intervene).toBe(false);
  });

  test('silent when a run is in-flight (§6.3)', () => {
    const d = decideMilestoneProbe({ ...baseMilestoneOpts, isRunInFlight: true });
    expect(d.intervene).toBe(false);
  });

  test('silent when an answer is in-flight (§6.3)', () => {
    const d = decideMilestoneProbe({ ...baseMilestoneOpts, isAnswerInFlight: true });
    expect(d.intervene).toBe(false);
  });

  test('silent when cross-path cooldown not elapsed', () => {
    const d = decideMilestoneProbe({ ...baseMilestoneOpts, cooldownOk: false });
    expect(d.intervene).toBe(false);
  });

  test('silent when probeGiven=true (budget consumed — run-path probe already fired)', () => {
    const d = decideMilestoneProbe({
      ...baseMilestoneOpts,
      budget: makeBudget({ probeGiven: true }),
    });
    expect(d.intervene).toBe(false);
  });

  test('silent when offerMade=true (budget consumed)', () => {
    const d = decideMilestoneProbe({
      ...baseMilestoneOpts,
      budget: makeBudget({ offerMade: true }),
    });
    expect(d.intervene).toBe(false);
  });

  test('silent when deepHintGiven=true (budget consumed)', () => {
    const d = decideMilestoneProbe({
      ...baseMilestoneOpts,
      budget: makeBudget({ deepHintGiven: true }),
    });
    expect(d.intervene).toBe(false);
  });

  test('silent on non-coding phase', () => {
    const d = decideMilestoneProbe({ ...baseMilestoneOpts, phase: 'oral' });
    expect(d.intervene).toBe(false);
  });

  test('milestone probe uses probe kind — synthetic row counted by ladder budget', () => {
    // Verify the budget accounting: a milestone probe (probe on a synthetic Idle row)
    // should set probeGiven=true via deriveRunAssistBudget.
    const milestoneRun: RunResult = {
      stdout: '',
      stderr: '',
      compileOutput: '',
      status: 'Idle',
      exitCode: null,
      timeMs: null,
      memoryKb: null,
      codeIndex: 0,
      intervention: { text: 'what complexity is that?', kind: 'probe' },
    };
    expect(isSyntheticRow(milestoneRun)).toBe(true);
    const budget = deriveRunAssistBudget([fail(), milestoneRun], 0);
    expect(budget.probeGiven).toBe(true);
  });

  test('milestone probe budget shared: probeGiven=true prevents subsequent run-path probe', () => {
    // After milestone probe fires, run-path decideRunIntervention sees probeGiven=true.
    const milestoneRun: RunResult = {
      stdout: '',
      stderr: '',
      compileOutput: '',
      status: 'Idle',
      exitCode: null,
      timeMs: null,
      memoryKb: null,
      codeIndex: 0,
      intervention: { text: 'what complexity?', kind: 'probe' },
    };
    const budget = deriveRunAssistBudget([fail(), milestoneRun], 0);
    expect(budget.probeGiven).toBe(true);
    // Run-path with probeGiven=true → no probe (would offer instead, but the budget prevents probe)
    const signals = {
      runsThisQuestion: 2,
      consecutiveFailures: 2,
      lastStatus: 'Runtime Error',
      lastRunPassed: false,
      hasErrorOutput: true,
      passedProgress: false,
      stagnant: false,
    };
    const decision = decideRunIntervention(signals, 'coding', budget, 'none');
    // probe already given → decision should be offer or quiet (not another probe)
    expect(decision.kind).not.toBe('probe');
  });
});
