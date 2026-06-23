import { scoreInterview, validateScorecard, fallbackScorecard, buildScoringPrompt } from './scorer';
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
});
