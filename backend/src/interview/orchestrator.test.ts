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
      };
      store.set(id, row);
      return row;
    }),
    getById: jest.fn(async (id: string) => store.get(id) ?? null),
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
    findInProgressPastDuration: jest.fn(async (cutoffIso: string) =>
      [...store.values()].filter(
        (r) =>
          (r as { status?: string }).status === 'in_progress' &&
          typeof (r as { tnc_accepted_at?: string }).tnc_accepted_at === 'string' &&
          (r as { tnc_accepted_at: string }).tnc_accepted_at < cutoffIso
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

// Fake execution kernel so recordRun can be driven offline (no Docker).
jest.mock('../execution/docker', () => ({
  createDockerKernel: () => ({
    run: async () => ({
      stdout: 'ok\n',
      stderr: '',
      compileOutput: '',
      status: 'Accepted',
      exitCode: 0,
      timeMs: 5,
      memoryKb: null,
    }),
  }),
}));

import * as orch from './orchestrator';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const db = require('../db/interviews');

beforeAll(() => {
  // Force the offline DeterministicOracle + scorer fallback (no live calls).
  delete process.env.MINIMAX_API_KEY;
});

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

    // Long answers avoid coding follow-ups so the flow advances briskly.
    const longAnswer =
      'This is a thorough, technically detailed answer that comfortably exceeds the ' +
      'follow-up threshold so the deterministic oracle advances the interview.';

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
});
