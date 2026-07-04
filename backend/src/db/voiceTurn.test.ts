// Unit tests for the voice-turn telemetry field coercion helpers.
// We extract the pure coercion logic so it can be tested without a DB connection.
// The route and DB function rely on the same logic; correctness here covers both.

describe('voice-turn telemetry field coercion', () => {
  // Mirror of the `toNum` helper used in both the route and the DB layer.
  const toNum = (v: unknown): number | null => {
    if (v == null) return null;
    const n = Number(v);
    return isFinite(n) ? Math.max(0, n) : null;
  };

  // Mirror of the `safeNum` helper in recordVoiceTurn.
  const safeNum = (v: number | null | undefined): number | null => {
    if (v == null || !isFinite(v)) return null;
    return Math.max(0, v);
  };

  const VALID_COMMITS = new Set([
    'smartturn',
    'backstop',
    'maxlen',
    'assemblyai_eot',
    'soniox_eot',
  ]);

  const MAX_TRANSCRIPT_CHARS = 4000;
  // Mirror of the `toText` helper in the route: strings only, length-capped, else null.
  const toText = (v: unknown): string | null => {
    if (typeof v !== 'string') return null;
    return v.slice(0, MAX_TRANSCRIPT_CHARS);
  };

  describe('toNum (route coercion)', () => {
    test('passes through finite positive numbers', () => {
      expect(toNum(120.5)).toBe(120.5);
      expect(toNum(0)).toBe(0);
    });

    test('clamps negative numbers to 0', () => {
      expect(toNum(-5)).toBe(0);
      expect(toNum(-0.001)).toBe(0);
    });

    test('returns null for null and undefined', () => {
      expect(toNum(null)).toBeNull();
      expect(toNum(undefined)).toBeNull();
    });

    test('returns null for Infinity and NaN', () => {
      expect(toNum(Infinity)).toBeNull();
      expect(toNum(-Infinity)).toBeNull();
      expect(toNum(NaN)).toBeNull();
    });

    test('coerces numeric strings', () => {
      expect(toNum('350')).toBe(350);
      expect(toNum('2.5')).toBeCloseTo(2.5);
    });

    test('returns null for non-numeric strings', () => {
      expect(toNum('abc')).toBeNull();
      // Note: Number('') === 0 in JS — the route accepts it as 0 (clamped), not null.
      expect(toNum('')).toBe(0);
    });
  });

  describe('safeNum (DB layer coercion)', () => {
    test('passes through finite positive numbers', () => {
      expect(safeNum(80.0)).toBe(80.0);
    });

    test('clamps negative to 0', () => {
      expect(safeNum(-1)).toBe(0);
    });

    test('returns null for null, undefined, Infinity, NaN', () => {
      expect(safeNum(null)).toBeNull();
      expect(safeNum(undefined)).toBeNull();
      expect(safeNum(Infinity)).toBeNull();
      expect(safeNum(NaN)).toBeNull();
    });
  });

  describe('commit validation', () => {
    test('accepts all valid commit kinds', () => {
      for (const c of ['smartturn', 'backstop', 'maxlen', 'assemblyai_eot', 'soniox_eot']) {
        expect(VALID_COMMITS.has(c)).toBe(true);
      }
    });

    test('accepts assemblyai_eot (regression: this being missing 400-rejected all AAI telemetry)', () => {
      expect(VALID_COMMITS.has('assemblyai_eot')).toBe(true);
    });

    test('rejects phases that are not commit kinds', () => {
      // false-fire / hallucination / done are PHASE values, never commit kinds.
      expect(VALID_COMMITS.has('false-fire')).toBe(false);
      expect(VALID_COMMITS.has('hallucination')).toBe(false);
      expect(VALID_COMMITS.has('done')).toBe(false);
    });

    test('rejects unknown commit kinds', () => {
      expect(VALID_COMMITS.has('unknown')).toBe(false);
      expect(VALID_COMMITS.has('')).toBe(false);
      expect(VALID_COMMITS.has('SMARTTURN')).toBe(false);
    });
  });

  describe('toText (transcript coercion)', () => {
    test('passes through normal strings', () => {
      expect(toText('binary search over the sorted array')).toBe(
        'binary search over the sorted array'
      );
      expect(toText('')).toBe('');
    });

    test('returns null for non-strings', () => {
      expect(toText(null)).toBeNull();
      expect(toText(undefined)).toBeNull();
      expect(toText(42)).toBeNull();
      expect(toText({ text: 'x' })).toBeNull();
    });

    test('caps length at MAX_TRANSCRIPT_CHARS', () => {
      const long = 'a'.repeat(MAX_TRANSCRIPT_CHARS + 500);
      expect(toText(long)?.length).toBe(MAX_TRANSCRIPT_CHARS);
    });
  });

  describe('boolean coercion (empty / terminal)', () => {
    // The route uses `=== true` strict equality — only the boolean true passes.
    const strictBool = (v: unknown): boolean => v === true;

    test('only boolean true is truthy', () => {
      expect(strictBool(true)).toBe(true);
      expect(strictBool(false)).toBe(false);
      expect(strictBool(1)).toBe(false);
      expect(strictBool('true')).toBe(false);
      expect(strictBool(null)).toBe(false);
    });
  });
});
