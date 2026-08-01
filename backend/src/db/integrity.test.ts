// Unit tests for the integrity-signal helpers: coercion, validation, aggregate logic,
// and the advisory prompt line. Tests are pure-logic mirrors — no DB connection needed.

import { INTEGRITY_SIGNAL_KINDS } from './interviews';

// ─────────────────────── kind validation ───────────────────────────────────

describe('INTEGRITY_SIGNAL_KINDS', () => {
  test('includes all six declared kinds', () => {
    const expected = [
      'second_voice',
      'blur',
      'hidden',
      'fullscreen_exit',
      'paste_blocked',
      'multi_monitor',
    ];
    for (const k of expected) {
      expect(INTEGRITY_SIGNAL_KINDS.has(k as never)).toBe(true);
    }
    expect(INTEGRITY_SIGNAL_KINDS.size).toBe(expected.length);
  });

  test('rejects unknown kinds', () => {
    expect(INTEGRITY_SIGNAL_KINDS.has('voiceprint' as never)).toBe(false);
    expect(INTEGRITY_SIGNAL_KINDS.has('' as never)).toBe(false);
    expect(INTEGRITY_SIGNAL_KINDS.has('SECOND_VOICE' as never)).toBe(false);
  });
});

// ─────────────────────── route coercion ────────────────────────────────────

describe('integrity-signal route field coercion', () => {
  // Mirror of the `toNum` helper used in the /integrity-signal route.
  const toNum = (v: unknown): number | null => {
    if (v == null) return null;
    const n = Number(v);
    return isFinite(n) ? Math.max(0, n) : null;
  };

  test('toNum passes through finite positive numbers', () => {
    expect(toNum(500)).toBe(500);
    expect(toNum(1234.5)).toBeCloseTo(1234.5);
    expect(toNum(0)).toBe(0);
  });

  test('toNum clamps negatives to 0', () => {
    expect(toNum(-1)).toBe(0);
  });

  test('toNum returns null for null, undefined, Infinity, NaN', () => {
    expect(toNum(null)).toBeNull();
    expect(toNum(undefined)).toBeNull();
    expect(toNum(Infinity)).toBeNull();
    expect(toNum(NaN)).toBeNull();
  });

  test('toNum coerces numeric strings', () => {
    expect(toNum('750')).toBe(750);
  });
});

// ─────────────────────── DB-layer coercion ─────────────────────────────────

describe('recordIntegritySignal DB-layer coercion', () => {
  // Mirror of the safeRound applied to duration_ms in recordIntegritySignal.
  const safeRound = (v: number): number => Math.max(0, Math.round(v));

  test('rounds fractional durationMs', () => {
    expect(safeRound(1499.9)).toBe(1500);
    expect(safeRound(1500.1)).toBe(1500);
  });

  test('clamps negative durationMs to 0', () => {
    expect(safeRound(-10)).toBe(0);
  });
});

// ─────────────────────── second-voice aggregate logic ──────────────────────

describe('getSecondVoiceSignals aggregate logic', () => {
  // Mirror of the aggregation in getSecondVoiceSignals.
  interface RawRow { duration_ms: number | null }

  function aggregate(rows: RawRow[]) {
    return {
      turnCount: rows.length,
      totalDurationMs: rows.reduce((s, r) => s + (r.duration_ms ?? 0), 0),
    };
  }

  test('returns zeroed aggregate for empty row set', () => {
    expect(aggregate([])).toEqual({ turnCount: 0, totalDurationMs: 0 });
  });

  test('counts rows as turns and sums duration_ms', () => {
    const rows: RawRow[] = [
      { duration_ms: 3000 },
      { duration_ms: 1500 },
      { duration_ms: null }, // null coerced to 0
    ];
    const agg = aggregate(rows);
    expect(agg.turnCount).toBe(3);
    expect(agg.totalDurationMs).toBe(4500);
  });

  test('treats null duration_ms as 0', () => {
    expect(aggregate([{ duration_ms: null }])).toEqual({ turnCount: 1, totalDurationMs: 0 });
  });
});

// ─────────────────────── advisory prompt line ──────────────────────────────

describe('second-voice advisory prompt line', () => {
  // Mirror of the integrityLine construction in buildScoringPrompt.
  interface SecondVoiceSummary { turnCount: number; totalDurationMs: number }

  function buildIntegrityLine(sv: SecondVoiceSummary): string {
    const toS = (ms: number): string => (ms / 1000).toFixed(1);
    return (
      `INTEGRITY SIGNALS (advisory context only — do NOT penalize the score; ` +
      `note in your summary if relevant): ` +
      `two or more distinct speakers detected across ${sv.turnCount} turn(s); ` +
      `non-primary speaker attributed ${toS(sv.totalDurationMs)}s total. ` +
      `This may indicate a second person present in the room; treat as neutral contextual ` +
      `information only — never as grounds for a score deduction.`
    );
  }

  test('formats totalDurationMs as seconds with one decimal place', () => {
    const line = buildIntegrityLine({ turnCount: 4, totalDurationMs: 47_500 });
    expect(line).toContain('47.5s');
    expect(line).toContain('4 turn(s)');
  });

  test('contains the non-penalize directive', () => {
    const line = buildIntegrityLine({ turnCount: 1, totalDurationMs: 1000 });
    expect(line).toContain('do NOT penalize the score');
  });

  test('contains the non-accusation language', () => {
    const line = buildIntegrityLine({ turnCount: 2, totalDurationMs: 5000 });
    expect(line).toContain('neutral contextual information only');
    expect(line).toContain('never as grounds for a score deduction');
  });
});
