import { scoreInterview, validateScorecard, fallbackScorecard, buildScoringPrompt, PENALIZABLE_KINDS } from './scorer';
import { MinimaxClient } from '../interview/minimax';

const stub = (raw: string): MinimaxClient => ({ complete: async () => raw });
const throwing: MinimaxClient = {
  complete: async () => {
    throw new Error('minimax down');
  },
};

describe('scoreInterview', () => {
  const input = { transcript: [{ role: 'candidate' as const, text: 'hi' }], codeRuns: [] };

  test('parses + validates a well-formed scorecard', async () => {
    const raw = JSON.stringify({
      overall: 4,
      recommendation: 'hire',
      dimensions: [{ name: 'problem_solving', score: 4, notes: 'solid' }],
      summary: 'good',
    });
    const sc = await scoreInterview(input, stub(raw));
    expect(sc.overall).toBe(4);
    expect(sc.recommendation).toBe('hire');
    expect(sc.dimensions[0]).toEqual({ name: 'problem_solving', score: 4, notes: 'solid' });
  });

  test('falls back safely on malformed JSON', async () => {
    const sc = await scoreInterview(input, stub('not json'));
    expect(sc).toEqual(fallbackScorecard());
    expect(sc.recommendation).toBe('no_hire');
  });

  test('falls back safely when the client throws', async () => {
    const sc = await scoreInterview(input, throwing);
    expect(sc.recommendation).toBe('no_hire');
  });
});

describe('validateScorecard', () => {
  test('clamps scores to 0..5 and coerces an invalid recommendation to no_hire', () => {
    const sc = validateScorecard({
      overall: 9,
      recommendation: 'definitely',
      dimensions: [{ name: 'depth', score: -3, notes: 5 }],
    });
    expect(sc.overall).toBe(5);
    expect(sc.recommendation).toBe('no_hire');
    expect(sc.dimensions[0].score).toBe(0);
    expect(sc.dimensions[0].notes).toBe(''); // non-string notes coerced
  });

  test('tolerates missing fields', () => {
    const sc = validateScorecard({});
    expect(sc.dimensions).toEqual([]);
    expect(sc.summary).toBe('');
  });
});

describe('buildScoringPrompt level calibration', () => {
  test('injects the chosen seniority level into the grading prompt', () => {
    const senior = buildScoringPrompt({ transcript: [], codeRuns: [], level: 'senior' });
    expect(senior).toContain('SENIOR');
  });

  test('defaults to mid-level calibration when no level is given', () => {
    const dflt = buildScoringPrompt({ transcript: [], codeRuns: [] });
    expect(dflt).toContain('MID');
  });

  // M1: a MANDATORY counter-question fires on every SUBMIT as a format step; it must NOT be counted
  // as interviewer assistance (which the scorer weighs down) — else every submitter is penalized.
  test('excludes a mandatory counter-question from the ASSISTANCE-GIVEN penalty', () => {
    const withMandatory = buildScoringPrompt({
      transcript: [
        { role: 'candidate', text: 'my solution uses a hash map' },
        {
          role: 'interviewer',
          text: 'What is the complexity of your hash map lookup?',
          assist: { kind: 'counter_question', strength: 1, mandatory: true },
        },
      ],
      codeRuns: [],
    });
    expect(withMandatory).not.toContain('ASSISTANCE GIVEN');

    // A NON-mandatory (oracle-chosen) hint IS still counted as assistance.
    const withHint = buildScoringPrompt({
      transcript: [
        { role: 'candidate', text: 'stuck' },
        {
          role: 'interviewer',
          text: 'Look at your boundary conditions.',
          assist: { kind: 'hint', strength: 2 },
        },
      ],
      codeRuns: [],
    });
    expect(withHint).toContain('ASSISTANCE GIVEN');
  });
});

describe('injection fencing in buildScoringPrompt (FIX 2)', () => {
  test('a 50k-char transcript turn produces a prompt with a bounded length', () => {
    const hugeText = 'x'.repeat(50_000);
    const prompt = buildScoringPrompt({
      transcript: [{ role: 'candidate', text: hugeText }],
      codeRuns: [],
    });
    // The 2000-char cap per turn + fence overhead keeps the total well under 50k.
    expect(prompt.length).toBeLessThan(10_000);
  });

  test('transcript turns are wrapped in CANDIDATE_DATA markers', () => {
    const prompt = buildScoringPrompt({
      transcript: [{ role: 'candidate', text: 'my answer to the question' }],
      codeRuns: [],
    });
    expect(prompt).toContain('<<<CANDIDATE_DATA');
    expect(prompt).toContain('CANDIDATE_DATA>>>');
    expect(prompt).toContain('my answer to the question');
  });

  test('finalCode is wrapped in CANDIDATE_DATA markers', () => {
    const prompt = buildScoringPrompt({
      transcript: [],
      codeRuns: [],
      finalCode: 'def solution(): return 42',
    });
    expect(prompt).toContain('<<<CANDIDATE_DATA');
    expect(prompt).toContain('CANDIDATE_DATA>>>');
    expect(prompt).toContain('def solution(): return 42');
  });
});

// ─────────────── D2: coding_ack is never penalized ───────────────────────────
// coding_ack is an advisory, non-advancing acknowledgment (D2 fix). It carries no `assist`
// tag on the transcript turn, so it is already excluded from PENALIZABLE_KINDS. This test
// locks that contract so a future change to the scoring path can't accidentally add it.

// ─────────────────────── Integrity signal isolation ───────────────────────────
// LEGAL REQUIREMENT: integritySignals must be STRUCTURALLY INCAPABLE of altering the numeric
// score (GDPR Art 22 + SCHUFA logic). This test asserts byte-identical scores with and without
// second-voice signals so any future change that accidentally routes integrity data into the
// score path will fail loudly here.

describe('scorer isolation — integritySignals NEVER alters numeric score', () => {
  const rawScorecard = JSON.stringify({
    overall: 3,
    recommendation: 'lean_hire',
    dimensions: [{ name: 'problem_solving', score: 3, notes: 'decent' }],
    summary: 'reasonable',
  });

  test('overall score is byte-identical with and without second-voice signals', async () => {
    const baseInput = { transcript: [{ role: 'candidate' as const, text: 'my answer' }], codeRuns: [] };
    const withSignals = { ...baseInput, integritySignals: { turnCount: 5, totalDurationMs: 60_000 } };

    const [base, withSig] = await Promise.all([
      scoreInterview(baseInput, stub(rawScorecard)),
      scoreInterview(withSignals, stub(rawScorecard)),
    ]);

    // Numeric score must be identical — signals are advisory text only.
    expect(withSig.overall).toBe(base.overall);
    expect(withSig.recommendation).toBe(base.recommendation);
    expect(withSig.scoringFailed).toBe(false);
  });

  test('integrityLine contains the non-penalize directive', () => {
    const prompt = buildScoringPrompt({
      transcript: [],
      codeRuns: [],
      integritySignals: { turnCount: 3, totalDurationMs: 45_000 },
    });
    expect(prompt).toContain('do NOT penalize the score');
    expect(prompt).toContain('3 turn(s)');
    expect(prompt).toContain('45.0s');
  });

  test('integrityLine is absent when no signals exist', () => {
    const prompt = buildScoringPrompt({ transcript: [], codeRuns: [] });
    expect(prompt).not.toContain('INTEGRITY SIGNALS');
  });

  test('integrityLine is absent when turnCount is 0', () => {
    const prompt = buildScoringPrompt({
      transcript: [],
      codeRuns: [],
      integritySignals: { turnCount: 0, totalDurationMs: 0 },
    });
    expect(prompt).not.toContain('INTEGRITY SIGNALS');
  });
});

describe('PENALIZABLE_KINDS — coding_ack is advisory (D2)', () => {
  test('coding_ack is NOT in PENALIZABLE_KINDS', () => {
    expect(PENALIZABLE_KINDS.has('coding_ack')).toBe(false);
  });

  test('all penalizable kinds are the expected set (no accidental additions)', () => {
    // Locked: only these three kinds may penalize the candidate.
    expect([...PENALIZABLE_KINDS].sort()).toEqual(['counter_question', 'hint', 'probe']);
  });

  test('advisory kinds (offer, nudge, encourage, coding_ack) are all absent from PENALIZABLE_KINDS', () => {
    for (const advisory of ['offer', 'nudge', 'encourage', 'coding_ack']) {
      expect(PENALIZABLE_KINDS.has(advisory)).toBe(false);
    }
  });

  test('coding_ack transcript turn (no assist tag) produces no ASSISTANCE-GIVEN section', () => {
    // coding_ack turns are persisted without an assist tag — the scorer never sees them
    // as interventions and therefore never penalizes them.
    const prompt = buildScoringPrompt({
      transcript: [
        { role: 'candidate', text: 'just thinking out loud' },
        { role: 'interviewer', text: 'Got it — keep going.' }, // no assist tag = coding_ack style
      ],
      codeRuns: [],
    });
    expect(prompt).not.toContain('ASSISTANCE GIVEN');
  });
});
