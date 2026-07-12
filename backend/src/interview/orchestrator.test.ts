// Offline integration test for the orchestrator: drives create → begin → answers
// through the FSM with an in-memory DB mock + the DeterministicOracle, asserting
// the interview progresses to a scored/terminal state and persists events.

// In-memory fake of the data layer.
jest.mock('../db/interviews', () => {
  const store = new Map<string, Record<string, unknown>>();
  const events: Array<{ id: string; kind: string; seq: number }> = [];
  const outbox: string[] = [];
  let n = 0;
  return {
    __events: events,
    __outbox: outbox,
    createInterview: jest.fn(async (input: Record<string, unknown>) => {
      const id = `iv-${++n}`;
      const row = {
        id,
        status: 'invited',
        phase: (input.fsmState as { phase: string }).phase,
        fsm_state: input.fsmState,
        transcript: [],
        code_runs: [],
        code_snapshot: '',
        candidate_email: input.candidateEmail,
        level: input.level ?? 'mid',
        role_brief: input.roleBrief ?? null,
        dev_mode: input.devMode ?? false,
      };
      store.set(id, row);
      return row;
    }),
    getById: jest.fn(async (id: string) => store.get(id) ?? null),
    // Proctor aggregate read (Phase 1 camera anti-cheat). Default: no windows recorded →
    // monitoredMs 0 → orchestrator omits the advisory section, so scoring tests are unaffected.
    // Providing it here exercises finishAndScore's fetch path instead of throwing "not a function".
    getProctorSignalsForInterview: jest.fn(async (_id: string) => ({
      monitoredMs: 0,
      faceAbsentMs: 0,
      multiFaceMs: 0,
      gazeOffMs: 0,
      maxFaces: 0,
      everMultiFace: false,
    })),
    updateInterview: jest.fn(async (id: string, patch: Record<string, unknown>) => {
      Object.assign(store.get(id) as object, patch);
    }),
    appendEvent: jest.fn(async (id: string, kind: string) => {
      events.push({ id, kind, seq: events.filter((e) => e.id === id).length + 1 });
    }),
    appendCodeRun: jest.fn(
      async (id: string, run: Record<string, unknown>, snapshot: string, language: string) => {
        const row = store.get(id) as {
          code_runs?: unknown[];
          code_snapshot?: string;
          code_language?: string;
        };
        row.code_runs = [...(row.code_runs ?? []), run];
        row.code_snapshot = snapshot;
        row.code_language = language;
      }
    ),
    claimBegin: jest.fn(async (id: string, patch: Record<string, unknown>) => {
      const row = store.get(id) as { status?: string } | undefined;
      if (row && row.status === 'invited') {
        row.status = 'in_progress';
        Object.assign(row, patch);
        return true;
      }
      return false;
    }),
    claimForScoring: jest.fn(async (id: string) => {
      const row = store.get(id) as { status?: string } | undefined;
      if (row && row.status === 'in_progress') {
        row.status = 'completed';
        return true;
      }
      return false;
    }),
    findStaleInvited: jest.fn(async () =>
      [...store.values()].filter(
        (r) => (r as { status?: string }).status === 'invited' && (r as { stale?: boolean }).stale
      )
    ),
    findInProgressPastDuration: jest.fn(async (cutoffIso: string, devMode?: boolean) =>
      [...store.values()].filter(
        (r) =>
          (r as { status?: string }).status === 'in_progress' &&
          typeof (r as { tnc_accepted_at?: string }).tnc_accepted_at === 'string' &&
          (r as { tnc_accepted_at: string }).tnc_accepted_at < cutoffIso &&
          (devMode === undefined || (r as { dev_mode?: boolean }).dev_mode === devMode)
      )
    ),
    claimExpire: jest.fn(async (id: string) => {
      const row = store.get(id) as { status?: string } | undefined;
      if (row && row.status === 'invited') {
        row.status = 'expired';
        return true;
      }
      return false;
    }),
    insertOutbox: jest.fn(async (id: string) => {
      outbox.push(id);
    }),
    makeOutboxStore: jest.fn(() => ({
      claimPending: async () => [],
      markSent: async () => {},
      markFailed: async () => {},
    })),
  };
});

// Fake execution kernel so recordRun can be driven offline (no Docker). The result is
// configurable (mock-prefixed so jest's factory can close over it) — defaults to Accepted, so
// tests that don't expect interventions are unaffected; the intervention test drives failures.
const mockRun = {
  result: {
    stdout: 'ok\n',
    stderr: '',
    compileOutput: '',
    status: 'Accepted',
    exitCode: 0 as number | null,
    timeMs: 5,
    memoryKb: null as number | null,
  },
};
jest.mock('../execution/docker', () => ({
  createDockerKernel: () => ({
    run: async () => ({ ...mockRun.result }),
  }),
}));

import * as orch from './orchestrator';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const db = require('../db/interviews');

beforeAll(() => {
  // Force the offline DeterministicOracle + scorer fallback (no live calls).
  delete process.env.MINIMAX_API_KEY;
});

// Long answers exceed the DeterministicOracle's 120-char threshold → followUp=false → advances.
// Short answers are below the threshold → followUp=true → triggers nudge/follow-up logic.
const longAnswer =
  'This is a thorough, technically detailed answer that comfortably exceeds the ' +
  'follow-up threshold so the deterministic oracle advances the interview.';

describe('orchestrator end-to-end (offline)', () => {
  test('create → begin → answers drives the FSM to a scored interview', async () => {
    const { id, token } = await orch.createInterview({
      interviewerId: 'u1',
      candidateEmail: 'cand@example.com',
    });
    expect(id).toBeTruthy();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);

    const begun = await orch.begin(id, { tncAccepted: true });
    expect(begun.phase).toBe('greeting');
    expect(begun.utterance.text).toBeTruthy();
    // Timer anchor: begin echoes back a parseable start timestamp.
    expect(typeof begun.startedAt).toBe('string');
    expect(Number.isNaN(new Date(begun.startedAt).getTime())).toBe(false);

    // Long answers avoid coding follow-ups so the flow advances briskly (defined at describe scope).
    let phase = begun.phase;
    let guard = 0;
    while (phase !== 'done' && guard < 30) {
      guard++;
      const res = await orch.submitAnswer(id, longAnswer);
      phase = res.phase;
    }

    expect(guard).toBeLessThan(30); // bounded — no infinite loop
    expect(phase).toBe('done');

    // Scoring now runs in the background (fire-and-forget) off the final answer; let it settle.
    await new Promise((r) => setTimeout(r, 0));

    // finishAndScore ran: status scored, a scorecard was written, outbox queued.
    const row = (await db.getById(id)) as Record<string, unknown>;
    expect(row.status).toBe('scored');
    expect(row.evaluation_score).toBeTruthy();
    expect(db.__outbox).toContain(id);
    // FIX 4: fsm_state.phase must equal 'done' after scoring (was diverging from the `phase`
    // column when finishAndScore only wrote `phase` but not `fsm_state`).
    expect((row.fsm_state as { phase: string }).phase).toBe('done');

    // Events were recorded for replay (transitions, utterances, answers, score).
    const kinds = new Set(
      db.__events.filter((e: { id: string }) => e.id === id).map((e: { kind: string }) => e.kind)
    );
    expect(kinds.has('transition')).toBe(true);
    expect(kinds.has('answer')).toBe(true);
    expect(kinds.has('score')).toBe(true);
  });

  test('recordRun persists the run atomically and getCandidateState restores it', async () => {
    const { id } = await orch.createInterview({
      interviewerId: 'u3',
      candidateEmail: 'c3@example.com',
    });
    await orch.begin(id, { tncAccepted: true });

    // FIX 3: recordRun now requires phase='coding'. Drive greeting→oral→oral→handoff→coding
    // with long answers (DeterministicOracle advances without follow-ups at >120 chars).
    for (let i = 0; i < 4; i++) await orch.submitAnswer(id, longAnswer);

    const result = await orch.recordRun(id, { language: 'python', source: 'print(1)\n' });
    expect(result.status).toBe('Accepted');
    expect(result.language).toBe('python');

    // The run is persisted via the atomic append (run + snapshot + language in one call).
    expect(db.appendCodeRun).toHaveBeenCalledWith(
      id,
      expect.objectContaining({ status: 'Accepted', language: 'python' }),
      'print(1)\n',
      'python'
    );

    // Resume snapshot restores language + last run output + the timer anchor.
    const state = await orch.getCandidateState(id);
    expect(state.codeSnapshot).toBe('print(1)\n');
    expect(state.language).toBe('python');
    expect(state.lastRunResult?.status).toBe('Accepted');
    expect(typeof state.startedAt).toBe('string');
  });

  test('closeStaleInterviews: no-show notified (incomplete); time-up dropout scored (time-limited)', async () => {
    // No-show: created, never begun, link expired (mock uses a `stale` flag for the invited query).
    const { id: noShowId } = await orch.createInterview({
      interviewerId: 'u4',
      candidateEmail: 'noshow@example.com',
    });
    // Time-up: begun > 60 min ago, engaged (≥1 answer), now idle past the duration cap.
    const { id: dropId } = await orch.createInterview({
      interviewerId: 'u5',
      candidateEmail: 'drop@example.com',
    });
    const drop = (await db.getById(dropId)) as Record<string, unknown>;
    drop.status = 'in_progress';
    drop.tnc_accepted_at = new Date(Date.now() - 90 * 60_000).toISOString(); // 90 min ago → past 60-min cap
    drop.transcript = [
      { role: 'interviewer', text: 'Hello' },
      { role: 'candidate', text: 'I worked through the first problem.' },
    ];
    ((await db.getById(noShowId)) as { stale?: boolean }).stale = true;

    const res = await orch.closeStaleInterviews();
    expect(res.noShow).toBe(1);
    expect(res.concluded).toBe(1);

    const ns = (await db.getById(noShowId)) as Record<string, unknown>;
    expect(ns.status).toBe('expired');
    expect((ns.evaluation_score as { incomplete?: boolean }).incomplete).toBe(true);

    // Time-up + engaged → a real, time-limited score (NOT incomplete), status scored.
    const dr = (await db.getById(dropId)) as Record<string, unknown>;
    expect(dr.status).toBe('scored');
    expect((dr.evaluation_score as { timeLimited?: boolean }).timeLimited).toBe(true);
    expect((dr.evaluation_score as { incomplete?: boolean }).incomplete).toBeFalsy();

    // Both queued an interviewer notification.
    expect(db.__outbox).toContain(noShowId);
    expect(db.__outbox).toContain(dropId);
  });

  test('closeStaleInterviews: a dev interview is concluded at its 2-min cap, not the 60-min cap', async () => {
    // dev_mode interview, begun 5 min ago: past the 2-min dev cap but well inside the 60-min
    // prod window. The old single (60-min) cutoff would have left it in_progress for ~55 more
    // minutes; the per-tier dev cutoff must collect it now.
    const { id: devId } = await orch.createInterview({
      interviewerId: 'u7',
      candidateEmail: 'dev@example.com',
      devMode: true,
    });
    const dev = (await db.getById(devId)) as Record<string, unknown>;
    dev.status = 'in_progress';
    dev.tnc_accepted_at = new Date(Date.now() - 5 * 60_000).toISOString(); // 5 min ago
    dev.transcript = [
      { role: 'interviewer', text: 'Hello' },
      { role: 'candidate', text: 'Started the dev test then closed the tab.' },
    ];

    const res = await orch.closeStaleInterviews();
    expect(res.concluded).toBe(1);

    const dr = (await db.getById(devId)) as Record<string, unknown>;
    expect(dr.status).toBe('scored');
    // Engaged + past its (dev) cap → a real, time-limited score, not incomplete.
    expect((dr.evaluation_score as { timeLimited?: boolean }).timeLimited).toBe(true);
    expect((dr.evaluation_score as { incomplete?: boolean }).incomplete).toBeFalsy();
    expect(db.__outbox).toContain(devId);
  });

  test('oral nudge: short oral answer triggers exactly one ask_oral_followup, then advances', async () => {
    // The DeterministicOracle fires followUp=true for answers shorter than 120 chars.
    const shortAnswer = 'short'; // 5 chars — always triggers followUp in DeterministicOracle

    const { id } = await orch.createInterview({
      interviewerId: 'uN1',
      candidateEmail: 'nudge@example.com',
    });
    await orch.begin(id, { tncAccepted: true }); // greeting phase

    // Greeting answer → moves to oral phase, asks oral Q0.
    let res = await orch.submitAnswer(id, longAnswer);
    expect(res.phase).toBe('oral');

    // Short answer on oral Q0 → oracle says followUp=true → machine emits ask_oral_followup.
    res = await orch.submitAnswer(id, shortAnswer);
    expect(res.state.phase).toBe('oral');
    expect(res.state.oralFollowUps).toBe(1);
    // The utterance should be a voice-mode re-probe (ask_oral_followup wired to 'voice').
    expect(res.utterance.expects).toBe('voice');

    // Answer the nudge (still short — weak) → must advance to oral Q1, NOT nudge again.
    res = await orch.submitAnswer(id, shortAnswer);
    expect(res.state.phase).toBe('oral');
    expect(res.state.oralAsked).toBe(2); // moved to Q1
    expect(res.state.oralFollowUps).toBe(0); // reset for new question
  });

  test('oral nudge: satisfactory oral answer advances immediately without a nudge', async () => {
    const { id } = await orch.createInterview({
      interviewerId: 'uN2',
      candidateEmail: 'good@example.com',
    });
    await orch.begin(id, { tncAccepted: true });

    // Greeting answer → oral phase.
    await orch.submitAnswer(id, longAnswer);

    // Long (substantive) answer → oracle says followUp=false → no nudge, go to Q1.
    const res = await orch.submitAnswer(id, longAnswer);
    expect(res.state.phase).toBe('oral');
    expect(res.state.oralAsked).toBe(2); // straight to Q1
    expect(res.state.oralFollowUps).toBe(0);
  });

  test('rescore refuses a closed-incomplete (abandoned) interview', async () => {
    const { id } = await orch.createInterview({
      interviewerId: 'u6',
      candidateEmail: 'ab@example.com',
    });
    const row = (await db.getById(id)) as Record<string, unknown>;
    row.interviewer_id = 'u6';
    row.status = 'abandoned';
    row.transcript = [
      { role: 'interviewer', text: 'hi' },
      { role: 'candidate', text: 'had to leave' },
    ];
    await expect(orch.rescore(id, 'u6')).rejects.toThrow(/abandoned/);
    // Must NOT have re-opened it into the sweep's blast radius.
    expect(((await db.getById(id)) as { status?: string }).status).toBe('abandoned');
  });

  test('begin requires T&C acceptance', async () => {
    const { id } = await orch.createInterview({
      interviewerId: 'u2',
      candidateEmail: 'c2@example.com',
    });
    await expect(orch.begin(id, { tncAccepted: false })).rejects.toThrow(/T&C/);
  });

  // ── FIX 1: submitAnswer mutex — both concurrent answers land in the transcript ─────────────

  test('submitAnswer: two concurrent calls serialize so both candidate turns land in the final transcript', async () => {
    const { id } = await orch.createInterview({
      interviewerId: 'uL1',
      candidateEmail: 'lock@example.com',
    });
    await orch.begin(id, { tncAccepted: true });

    // Fire two concurrent submitAnswer calls with distinct requestIds and answers. Without the
    // per-interview lock, both would read the same stale interview (greeting phase), and the
    // second write would overwrite the first caller's candidate turn + FSM transition. With the
    // lock they serialise: the second reads the updated transcript and both turns persist.
    const [r1, r2] = await Promise.all([
      orch.submitAnswer(id, 'answer-one', 'req-lock-1'),
      orch.submitAnswer(id, 'answer-two', 'req-lock-2'),
    ]);

    expect(r1.utterance.text).toBeTruthy();
    expect(r2.utterance.text).toBeTruthy();

    const row = (await db.getById(id)) as { transcript: Array<{ role: string; text: string }> };
    const candidateTurns = row.transcript.filter((t) => t.role === 'candidate');
    expect(candidateTurns.some((t) => t.text === 'answer-one')).toBe(true);
    expect(candidateTurns.some((t) => t.text === 'answer-two')).toBe(true);
  });

  // ── FIX 2: begin CAS — the race loser gets 409, not a silently stolen session token ────────

  test('begin: claimBegin CAS lets the first caller win; the second gets 409', async () => {
    const { id } = await orch.createInterview({
      interviewerId: 'uB1',
      candidateEmail: 'begin-race@example.com',
    });

    // Override: first call wins (true), second call loses (false). The order is determined by
    // which Promise.all branch reaches claimBegin first — both outcomes are tested below.
    db.claimBegin.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const [r1, r2] = await Promise.allSettled([
      orch.begin(id, { tncAccepted: true }),
      orch.begin(id, { tncAccepted: true }),
    ]);

    // Exactly one succeeds and one rejects with 409.
    const results = [r1, r2];
    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(1);
    expect(results.filter((r) => r.status === 'rejected').length).toBe(1);
    const loser = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(loser.reason).toMatchObject({ status: 409 });
  });

  // ── FIX 3: recordRun phase gate — 409 during oral, allowed only in coding ─────────────────

  test('recordRun rejects with 409 when phase is oral (not coding)', async () => {
    const { id } = await orch.createInterview({
      interviewerId: 'uR1',
      candidateEmail: 'run-oral@example.com',
    });
    await orch.begin(id, { tncAccepted: true });

    // One longAnswer advances greeting → oral (asks oral Q0). Phase is now 'oral'.
    const oral = await orch.submitAnswer(id, longAnswer);
    expect(oral.phase).toBe('oral');

    // recordRun must refuse: code runs are only valid in the coding round.
    await expect(
      orch.recordRun(id, { language: 'python', source: 'print(1)' })
    ).rejects.toMatchObject({ status: 409, message: 'Code runs open in the coding round.' });
  });

  test('autonomous intervention: repeated failing runs trigger a bounded hint, never advancing the FSM', async () => {
    const failing = {
      stdout: '',
      stderr: 'Traceback (most recent call last): NameError',
      compileOutput: '',
      status: 'Runtime Error',
      exitCode: 1 as number | null,
      timeMs: 5,
      memoryKb: null as number | null,
    };
    const accepted = { ...mockRun.result };

    const { id } = await orch.createInterview({
      interviewerId: 'u8',
      candidateEmail: 'struggler@example.com',
    });
    await orch.begin(id, { tncAccepted: true });
    // Drive greeting → oral(0) → oral(1) → handoff → coding (4 answers).
    // Use longAnswer (>120 chars) so the DeterministicOracle returns followUp=false for oral
    // questions — we don't want nudges here, just a clean path to the coding phase.
    for (let i = 0; i < 4; i++) await orch.submitAnswer(id, longAnswer);
    let row = (await db.getById(id)) as Record<string, unknown>;
    expect((row.fsm_state as { phase: string }).phase).toBe('coding');
    const codingTxLen = (row.transcript as unknown[]).length;

    mockRun.result = { ...failing };

    // 1st failure: not jumpy — stays quiet.
    expect(
      (await orch.recordRun(id, { language: 'python', source: 'x=' })).intervention
    ).toBeUndefined();
    // 2nd consecutive failure: a gentle probe.
    expect(
      (await orch.recordRun(id, { language: 'python', source: 'x=' })).intervention?.kind
    ).toBe('probe');

    // The FSM is untouched — recordRun writes neither fsm_state nor the transcript, so a run can
    // never clobber a concurrent answer's transition.
    row = (await db.getById(id)) as Record<string, unknown>;
    expect((row.fsm_state as { phase: string }).phase).toBe('coding');
    expect((row.fsm_state as { codeIndex: number }).codeIndex).toBe(0);
    expect(row.status).toBe('in_progress');
    // The hint rides ON the code run (atomic), not the transcript.
    const runs = row.code_runs as Array<{ intervention?: { kind: string } }>;
    expect(runs.some((r) => r.intervention?.kind === 'probe')).toBe(true);

    // The candidate hits the IDENTICAL error every run (same source) → stagnant, so after the probe
    // we escalate straight to the OFFER without burning the full cooldown (get help there sooner).
    // The non-stagnant cooldown path is covered in intervention.test.ts.
    expect(
      (await orch.recordRun(id, { language: 'python', source: 'x=' })).intervention?.kind
    ).toBe('offer');
    // Candidate ignored the offer and kept failing → deliver the deep hint (they had the chance to decline).
    expect(
      (await orch.recordRun(id, { language: 'python', source: 'x=' })).intervention?.kind
    ).toBe('hint');
    // Deep hint delivered — it goes quiet rather than nagging.
    expect(
      (await orch.recordRun(id, { language: 'python', source: 'x=' })).intervention
    ).toBeUndefined();

    // Five code runs, zero transcript writes — proof the overlay never touched the turn record.
    const finalTx = ((await db.getById(id)) as { transcript: unknown[] }).transcript;
    expect(finalTx.length).toBe(codingTxLen);

    mockRun.result = accepted; // reset for any later tests
  });
});
