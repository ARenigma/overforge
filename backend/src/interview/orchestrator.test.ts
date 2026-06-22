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
    appendCodeRun: jest.fn(async () => {}),
    claimForScoring: jest.fn(async (id: string) => {
      const row = store.get(id) as { status?: string } | undefined;
      if (row && row.status === 'in_progress') {
        row.status = 'completed';
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

  test('begin requires T&C acceptance', async () => {
    const { id } = await orch.createInterview({
      interviewerId: 'u2',
      candidateEmail: 'c2@example.com',
    });
    await expect(orch.begin(id, { tncAccepted: false })).rejects.toThrow(/T&C/);
  });
});
