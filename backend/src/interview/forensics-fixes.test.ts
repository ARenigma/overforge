// Unit tests for the six forensics-2026-08-12 backend fixes.
// Fix 1 + 2 + 5b live in orchestrator.test.ts (need the in-memory DB mock).
// This file covers Fix 3, 4, 5a, 6 which are testable as pure unit tests.

import { DeterministicOracle } from './oracle';
import type { InterviewContext } from './types';
import {
  buildScoringPrompt,
  factCheckScorecard,
  overwriteFactViolations,
  validateScorecard,
  type SystemFlag,
} from '../scoring/scorer';
import { deriveSecondVoiceFlags } from './orchestrator';
import { CANDIDATE_INTEGRITY_KINDS } from '../http/interviews';

// ─────────── Minimal InterviewContext stub ────────────────────────────────────────────────────
// Only the fields that the oracle functions inspect are needed here.

function makeCtx(overrides: Partial<InterviewContext> = {}): InterviewContext {
  return {
    phase: 'coding',
    oralAsked: 3,
    codeIndex: 0,
    followUps: 0,
    oralFollowUps: 0,
    clarifyCount: 0,
    config: {
      coreQuestions: 2,
      oralQuestions: 3,
      maxFollowUps: 3,
      codeMaxFollowUps: 2,
    },
    ...overrides,
  };
}

// ─────────── Fix 3: intervention repeat-guard — COUNTER_QUESTION_POOL rotation ──────────────
// Root cause: canned.counter_question was a single hardcoded string, so the deterministic
// fallback returned the same text on consecutive non-mandatory follow-ups.
// Fix: pool of 3 items rotated by ctx.followUps.

describe('Fix 3 — counter_question pool rotates by ctx.followUps', () => {
  const oracle = new DeterministicOracle();

  test('followUps 0 and followUps 1 produce different counter_question texts', async () => {
    const r0 = await oracle.generateIntervention({
      kind: 'counter_question',
      ctx: makeCtx({ followUps: 0 }),
      transcript: [],
    });
    const r1 = await oracle.generateIntervention({
      kind: 'counter_question',
      ctx: makeCtx({ followUps: 1 }),
      transcript: [],
    });
    expect(r0.text).not.toBe(r1.text);
  });

  test('followUps 1 and followUps 2 produce different counter_question texts', async () => {
    const r1 = await oracle.generateIntervention({
      kind: 'counter_question',
      ctx: makeCtx({ followUps: 1 }),
      transcript: [],
    });
    const r2 = await oracle.generateIntervention({
      kind: 'counter_question',
      ctx: makeCtx({ followUps: 2 }),
      transcript: [],
    });
    expect(r1.text).not.toBe(r2.text);
  });

  test('mandatory codeAnchoredProbe also rotates by ctx.followUps for the same code', async () => {
    const code = 'def solution(nums):\n    return sorted(nums)';
    const r0 = await oracle.generateIntervention({
      kind: 'counter_question',
      ctx: makeCtx({ followUps: 0 }),
      transcript: [],
      code,
      mandatory: true,
    });
    const r1 = await oracle.generateIntervention({
      kind: 'counter_question',
      ctx: makeCtx({ followUps: 1 }),
      transcript: [],
      code,
      mandatory: true,
    });
    // Same code, different followUps → different anchor template
    expect(r0.text).not.toBe(r1.text);
  });

  test('pool wraps around: followUps 3 produces the same text as followUps 0', async () => {
    const r0 = await oracle.generateIntervention({
      kind: 'counter_question',
      ctx: makeCtx({ followUps: 0 }),
      transcript: [],
    });
    const r3 = await oracle.generateIntervention({
      kind: 'counter_question',
      ctx: makeCtx({ followUps: 3 }),
      transcript: [],
    });
    // Pool length is 3 → 3 % 3 === 0 → same entry as index 0
    expect(r3.text).toBe(r0.text);
  });
});

// ─────────── Fix 4: second_voice_turn SystemFlag in scorer ───────────────────────────────────
// Root cause: 113 s of Hindi second-speaker audio attributed to the candidate in scoring.
// Fix: deriveSecondVoiceFlags maps integrity_signals timestamps → transcript turn indices,
// passed as additionalSystemFlags into buildScoringPrompt / factCheckScorecard.

describe('Fix 4 — second_voice_turn flag in scorer', () => {
  const hindiExcerpt = 'हाँ, यह सही है'; // "Yes, that is correct" — prototypical second-speaker

  const secondVoiceFlag: SystemFlag = {
    turnIndex: 1,
    kind: 'second_voice_turn',
    excerpt: hindiExcerpt,
  };

  test('buildScoringPrompt includes exclusion directive for second_voice_turn', () => {
    const prompt = buildScoringPrompt({
      transcript: [
        { role: 'interviewer', text: 'Walk me through it' },
        { role: 'candidate', text: hindiExcerpt },
      ],
      codeRuns: [],
      additionalSystemFlags: [secondVoiceFlag],
    });
    expect(prompt).toContain('third-party speech');
    expect(prompt).toContain('NOT the candidate speaking');
  });

  test('factCheckScorecard raises a violation when the scorecard judges the second_voice turn', () => {
    // The scorer quoted the Hindi excerpt in the notes — should trigger a violation.
    const card = validateScorecard({
      overall: 3,
      recommendation: 'lean_hire',
      dimensions: [
        {
          name: 'communication',
          score: 2,
          notes: `candidate said "${hindiExcerpt}" which shows poor English communication`,
        },
      ],
      summary: '',
    });
    const violations = factCheckScorecard(card, [], [secondVoiceFlag]);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain('system-failure');
  });

  test('overwriteFactViolations strips the sentence that mentions the second_voice excerpt', () => {
    const card = validateScorecard({
      overall: 3,
      recommendation: 'lean_hire',
      dimensions: [
        {
          name: 'communication',
          score: 2,
          notes: `The candidate coded well. Candidate said "${hindiExcerpt}" — alarming. Good problem solving.`,
        },
      ],
      summary: '',
    });
    const fixed = overwriteFactViolations(card, [], [secondVoiceFlag]);
    expect(fixed.dimensions[0].notes).not.toContain(hindiExcerpt);
    // Non-flagged sentences must survive
    expect(fixed.dimensions[0].notes).toContain('coded well');
  });
});

// ─────────── Fix 4: deriveSecondVoiceFlags ────────────────────────────────────────────────────
// Pure mapping: integrity_signal at time T → answer event at ±20 s → Nth candidate turn in transcript.

describe('Fix 4 — deriveSecondVoiceFlags timestamp mapping', () => {
  const T0 = new Date('2026-08-12T10:00:00.000Z');
  const T5 = new Date('2026-08-12T10:00:05.000Z'); // 5 s after T0 (within ±20 s window)
  const T60 = new Date('2026-08-12T10:01:00.000Z'); // 60 s after T0 (outside ±20 s window)

  const transcript = [
    { role: 'interviewer' as const, text: 'Walk me through it' },
    { role: 'candidate' as const, text: 'हाँ, यह सही है' }, // candidate turn index 1
    { role: 'interviewer' as const, text: 'Okay, go on' },
    { role: 'candidate' as const, text: 'Sure, so my approach is...' }, // candidate turn index 3
  ];

  test('signal within ±20 s of an answer event flags the correct candidate turn', () => {
    const signals = [{ at: T5, durationMs: 3_000 }]; // 5 s after first answer event
    const answerEvents = [{ createdAt: T0 }]; // first candidate answer
    const flags = deriveSecondVoiceFlags(signals, answerEvents, transcript);
    expect(flags).toHaveLength(1);
    expect(flags[0].kind).toBe('second_voice_turn');
    expect(flags[0].turnIndex).toBe(1); // first candidate turn = index 1 in mixed transcript
    expect(flags[0].excerpt).toContain('हाँ');
  });

  test('signal more than 20 s away from all answer events is ignored (no flag)', () => {
    const signals = [{ at: T60, durationMs: 2_000 }]; // 60 s after T0 — no match
    const answerEvents = [{ createdAt: T0 }]; // only one answer event at T0
    const flags = deriveSecondVoiceFlags(signals, answerEvents, transcript);
    expect(flags).toHaveLength(0);
  });

  test('second signal maps to the second candidate turn (Nth answer event → Nth candidate turn)', () => {
    const T1 = new Date('2026-08-12T10:00:30.000Z');
    const T1sig = new Date('2026-08-12T10:00:32.000Z'); // 2 s after second answer event
    const signals = [{ at: T1sig, durationMs: 1_000 }];
    const answerEvents = [{ createdAt: T0 }, { createdAt: T1 }]; // two answer events
    const flags = deriveSecondVoiceFlags(signals, answerEvents, transcript);
    expect(flags).toHaveLength(1);
    expect(flags[0].turnIndex).toBe(3); // second candidate turn = index 3 in mixed transcript
  });
});

// ─────────── Fix 5a: CANDIDATE_INTEGRITY_KINDS whitelist ─────────────────────────────────────
// Root cause: the /integrity-signal route accepted 'second_voice' from the browser, which
// would allow a candidate to self-report or suppress their own proctoring row.
// Fix: new /integrity route (candidate-auth) restricts to blur / hidden / fullscreen_exit only.

describe('Fix 5a — CANDIDATE_INTEGRITY_KINDS whitelist', () => {
  test('contains exactly blur, hidden, and fullscreen_exit', () => {
    expect([...CANDIDATE_INTEGRITY_KINDS].sort()).toEqual(
      ['blur', 'fullscreen_exit', 'hidden']
    );
  });

  test('second_voice is excluded (server-only kind, never accepted from browser)', () => {
    expect(CANDIDATE_INTEGRITY_KINDS.has('second_voice' as never)).toBe(false);
  });

  test('paste_blocked and multi_monitor are also excluded (not candidate-reportable yet)', () => {
    expect(CANDIDATE_INTEGRITY_KINDS.has('paste_blocked' as never)).toBe(false);
    expect(CANDIDATE_INTEGRITY_KINDS.has('multi_monitor' as never)).toBe(false);
  });
});

// ─────────── Fix 6: clarify fallback rotation by clarifyCount ────────────────────────────────
// Root cause: two clarifies in 22 s produced near-identical advice because
// DeterministicOracle.classifyAndAnswer used a single hardcoded fallback string.
// Fix: CLARIFY_FALLBACK_POOL of 3 items rotated by ctx.clarifyCount.

describe('Fix 6 — clarify fallback pool rotates by ctx.clarifyCount', () => {
  const oracle = new DeterministicOracle();
  const questionText = 'What does the problem mean exactly?'; // ends with ?

  test('clarifyCount 0 and clarifyCount 1 produce different fallback text', async () => {
    const r0 = await oracle.classifyAndAnswer({
      text: questionText,
      ctx: makeCtx({ clarifyCount: 0 }),
      transcript: [],
    });
    const r1 = await oracle.classifyAndAnswer({
      text: questionText,
      ctx: makeCtx({ clarifyCount: 1 }),
      transcript: [],
    });
    expect(r0.intent).toBe('question');
    expect(r1.intent).toBe('question');
    expect(r0.reply?.text).not.toBe(r1.reply?.text);
  });

  test('clarifyCount 1 and clarifyCount 2 produce different fallback text', async () => {
    const r1 = await oracle.classifyAndAnswer({
      text: questionText,
      ctx: makeCtx({ clarifyCount: 1 }),
      transcript: [],
    });
    const r2 = await oracle.classifyAndAnswer({
      text: questionText,
      ctx: makeCtx({ clarifyCount: 2 }),
      transcript: [],
    });
    expect(r1.reply?.text).not.toBe(r2.reply?.text);
  });

  test('clarifyCount 3 wraps to pool[0] (same as clarifyCount 0)', async () => {
    const r0 = await oracle.classifyAndAnswer({
      text: questionText,
      ctx: makeCtx({ clarifyCount: 0 }),
      transcript: [],
    });
    const r3 = await oracle.classifyAndAnswer({
      text: questionText,
      ctx: makeCtx({ clarifyCount: 3 }),
      transcript: [],
    });
    // Pool length is 3 → 3 % 3 === 0 → same as index 0
    expect(r3.reply?.text).toBe(r0.reply?.text);
  });

  test('a non-question utterance is still classified as intent=answer (rotation guard unchanged)', async () => {
    const r = await oracle.classifyAndAnswer({
      text: 'I think I should use a hash map',
      ctx: makeCtx({ clarifyCount: 0 }),
      transcript: [],
    });
    expect(r.intent).toBe('answer');
    expect(r.reply).toBeUndefined();
  });
});
