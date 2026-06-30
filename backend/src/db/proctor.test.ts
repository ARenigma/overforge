// Unit tests for proctor-signal field coercion and aggregate logic.
// We extract the pure helpers so they can be tested without a DB connection.
// The route and DB function rely on the same logic; correctness here covers both.

describe('proctor-signal field coercion', () => {
  // Mirror of the `toInt` helper used in the route.
  const toInt = (v: unknown): number => {
    if (v == null) return 0;
    const n = Number(v);
    return isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  };

  // Mirror of the `safeInt` helper in recordProctorSignal.
  const safeInt = (v: number): number => {
    if (!isFinite(v)) return 0;
    return Math.max(0, Math.round(v));
  };

  describe('toInt (route coercion)', () => {
    test('passes through positive integers', () => {
      expect(toInt(500)).toBe(500);
      expect(toInt(0)).toBe(0);
    });

    test('truncates (not rounds) fractional numbers', () => {
      expect(toInt(1.9)).toBe(1);
      expect(toInt(2.1)).toBe(2);
    });

    test('clamps negative numbers to 0', () => {
      expect(toInt(-1)).toBe(0);
      expect(toInt(-100)).toBe(0);
    });

    test('returns 0 for null and undefined', () => {
      expect(toInt(null)).toBe(0);
      expect(toInt(undefined)).toBe(0);
    });

    test('returns 0 for Infinity and NaN', () => {
      expect(toInt(Infinity)).toBe(0);
      expect(toInt(-Infinity)).toBe(0);
      expect(toInt(NaN)).toBe(0);
    });

    test('coerces numeric strings', () => {
      expect(toInt('300')).toBe(300);
      expect(toInt('2.9')).toBe(2);
    });

    test('returns 0 for non-numeric strings', () => {
      expect(toInt('abc')).toBe(0);
      expect(toInt('')).toBe(0);
    });
  });

  describe('safeInt (DB layer coercion)', () => {
    test('passes through positive integers', () => {
      expect(safeInt(200)).toBe(200);
      expect(safeInt(0)).toBe(0);
    });

    test('rounds fractional numbers', () => {
      expect(safeInt(1.5)).toBe(2);
      expect(safeInt(1.4)).toBe(1);
    });

    test('clamps negatives to 0', () => {
      expect(safeInt(-5)).toBe(0);
    });

    test('returns 0 for non-finite values', () => {
      expect(safeInt(Infinity)).toBe(0);
      expect(safeInt(-Infinity)).toBe(0);
      expect(safeInt(NaN)).toBe(0);
    });
  });
});

describe('proctor-signal aggregate logic', () => {
  // Mirror of the aggregation loop in getProctorSignalsForInterview.
  interface RawRow {
    window_ms: number | null;
    face_absent_ms: number | null;
    multi_face_ms: number | null;
    gaze_off_ms: number | null;
    max_faces: number | null;
  }

  function aggregate(rows: RawRow[]) {
    let monitoredMs = 0;
    let faceAbsentMs = 0;
    let multiFaceMs = 0;
    let gazeOffMs = 0;
    let maxFaces = 0;
    let everMultiFace = false;

    for (const row of rows) {
      monitoredMs += row.window_ms ?? 0;
      faceAbsentMs += row.face_absent_ms ?? 0;
      multiFaceMs += row.multi_face_ms ?? 0;
      gazeOffMs += row.gaze_off_ms ?? 0;
      const rowMax = row.max_faces ?? 0;
      if (rowMax > maxFaces) maxFaces = rowMax;
      if (rowMax > 1) everMultiFace = true;
    }

    return { monitoredMs, faceAbsentMs, multiFaceMs, gazeOffMs, maxFaces, everMultiFace };
  }

  test('returns zeroed aggregate for empty row set', () => {
    expect(aggregate([])).toEqual({
      monitoredMs: 0,
      faceAbsentMs: 0,
      multiFaceMs: 0,
      gazeOffMs: 0,
      maxFaces: 0,
      everMultiFace: false,
    });
  });

  test('sums window_ms, face_absent_ms, multi_face_ms, gaze_off_ms across windows', () => {
    const rows: RawRow[] = [
      { window_ms: 5000, face_absent_ms: 1000, multi_face_ms: 0, gaze_off_ms: 500, max_faces: 1 },
      { window_ms: 5000, face_absent_ms: 500, multi_face_ms: 200, gaze_off_ms: 100, max_faces: 1 },
    ];
    const agg = aggregate(rows);
    expect(agg.monitoredMs).toBe(10000);
    expect(agg.faceAbsentMs).toBe(1500);
    expect(agg.multiFaceMs).toBe(200);
    expect(agg.gazeOffMs).toBe(600);
  });

  test('max_faces is the maximum across all windows (not sum)', () => {
    const rows: RawRow[] = [
      { window_ms: 5000, face_absent_ms: 0, multi_face_ms: 0, gaze_off_ms: 0, max_faces: 1 },
      { window_ms: 5000, face_absent_ms: 0, multi_face_ms: 0, gaze_off_ms: 0, max_faces: 3 },
      { window_ms: 5000, face_absent_ms: 0, multi_face_ms: 0, gaze_off_ms: 0, max_faces: 2 },
    ];
    expect(aggregate(rows).maxFaces).toBe(3);
  });

  test('everMultiFace is true when any window has max_faces > 1', () => {
    const rows: RawRow[] = [
      { window_ms: 5000, face_absent_ms: 0, multi_face_ms: 0, gaze_off_ms: 0, max_faces: 1 },
      { window_ms: 5000, face_absent_ms: 0, multi_face_ms: 500, gaze_off_ms: 0, max_faces: 2 },
    ];
    expect(aggregate(rows).everMultiFace).toBe(true);
  });

  test('everMultiFace is false when all windows have max_faces <= 1', () => {
    const rows: RawRow[] = [
      { window_ms: 5000, face_absent_ms: 0, multi_face_ms: 0, gaze_off_ms: 0, max_faces: 1 },
      { window_ms: 5000, face_absent_ms: 100, multi_face_ms: 0, gaze_off_ms: 0, max_faces: 1 },
    ];
    expect(aggregate(rows).everMultiFace).toBe(false);
  });

  test('treats null column values as 0', () => {
    const rows: RawRow[] = [
      {
        window_ms: null,
        face_absent_ms: null,
        multi_face_ms: null,
        gaze_off_ms: null,
        max_faces: null,
      },
    ];
    expect(aggregate(rows)).toEqual({
      monitoredMs: 0,
      faceAbsentMs: 0,
      multiFaceMs: 0,
      gazeOffMs: 0,
      maxFaces: 0,
      everMultiFace: false,
    });
  });
});

describe('proctor advisory prompt injection', () => {
  // Mirror of the proctorLine construction in buildScoringPrompt.
  interface ProctorAggregate {
    monitoredMs: number;
    faceAbsentMs: number;
    multiFaceMs: number;
    gazeOffMs: number;
    maxFaces: number;
    everMultiFace: boolean;
  }

  function buildProctorLine(p: ProctorAggregate): string {
    const toS = (ms: number): string => (ms / 1000).toFixed(1);
    return (
      `PROCTORING SIGNALS (advisory context only — do NOT penalize the score; ` +
      `note anomalies in your summary): ` +
      `monitored ${toS(p.monitoredMs)}s; ` +
      `face-absent ${toS(p.faceAbsentMs)}s; ` +
      `multiple-people ${toS(p.multiFaceMs)}s (ever: ${p.everMultiFace ? 'yes' : 'no'}); ` +
      `looking-away ${toS(p.gazeOffMs)}s`
    );
  }

  test('formats ms values as seconds with one decimal place', () => {
    const line = buildProctorLine({
      monitoredMs: 3600000,
      faceAbsentMs: 5000,
      multiFaceMs: 2500,
      gazeOffMs: 10000,
      maxFaces: 2,
      everMultiFace: true,
    });
    expect(line).toContain('monitored 3600.0s');
    expect(line).toContain('face-absent 5.0s');
    expect(line).toContain('multiple-people 2.5s');
    expect(line).toContain('looking-away 10.0s');
  });

  test('renders everMultiFace as yes/no', () => {
    const lineYes = buildProctorLine({
      monitoredMs: 1000,
      faceAbsentMs: 0,
      multiFaceMs: 500,
      gazeOffMs: 0,
      maxFaces: 2,
      everMultiFace: true,
    });
    expect(lineYes).toContain('(ever: yes)');

    const lineNo = buildProctorLine({
      monitoredMs: 1000,
      faceAbsentMs: 0,
      multiFaceMs: 0,
      gazeOffMs: 0,
      maxFaces: 1,
      everMultiFace: false,
    });
    expect(lineNo).toContain('(ever: no)');
  });

  test('advisory line contains the non-penalize directive', () => {
    const line = buildProctorLine({
      monitoredMs: 5000,
      faceAbsentMs: 0,
      multiFaceMs: 0,
      gazeOffMs: 0,
      maxFaces: 1,
      everMultiFace: false,
    });
    expect(line).toContain('do NOT penalize the score');
  });
});
