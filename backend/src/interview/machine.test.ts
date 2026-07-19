import { advance, initialContext, isTerminal } from './machine';
import { InterviewContext, InterviewEvent, Effect, OracleDecision } from './types';
import { DeterministicOracle } from './oracle';

// Helper: produce an oral-phase answer event with an explicit followUp decision.
const oralAnswer = (followUp: boolean): InterviewEvent => ({
  type: 'answer',
  decision: { followUp, reason: 'test', signal: followUp ? 0.2 : 0.8 },
});

// Drive the machine through a list of events, collecting the emitted effects.
function run(
  events: InterviewEvent[],
  config = undefined as never
): { effects: Effect[]; ctx: InterviewContext } {
  let ctx = initialContext(config);
  const effects: Effect[] = [];
  for (const ev of events) {
    const res = advance(ctx, ev);
    ctx = res.ctx;
    effects.push(res.effect);
  }
  return { effects, ctx };
}

const answer = (followUp?: boolean): InterviewEvent =>
  followUp === undefined
    ? { type: 'answer' }
    : { type: 'answer', decision: { followUp, reason: '', signal: 0 } };

describe('interview machine', () => {
  test('happy path: 2 oral + 2 core, no follow-ups', () => {
    const { effects, ctx } = run([
      { type: 'start' },
      answer(), // greeting -> ask_oral(0)
      answer(), // oral -> ask_oral(1)
      answer(), // oral done -> handoff
      answer(), // handoff -> ask_code(0)
      answer(false), // code0 -> ask_code(1)
      answer(false), // code1 -> wrap_up
      answer(), // wrap_up -> score
      answer(), // scoring -> done
    ]);
    expect(effects.map((e) => e.kind)).toEqual([
      'greet',
      'ask_oral',
      'ask_oral',
      'handoff',
      'ask_code',
      'ask_code',
      'wrap_up',
      'score',
      'done',
    ]);
    expect((effects[1] as { index: number }).index).toBe(0);
    expect((effects[2] as { index: number }).index).toBe(1);
    expect(isTerminal(ctx)).toBe(true);
  });

  test('coding follow-ups are capped at codeMaxFollowUps (default 2) even if the oracle keeps asking', () => {
    const { effects } = run([
      { type: 'start' },
      answer(), // ask_oral(0)
      answer(), // ask_oral(1)
      answer(), // handoff
      answer(), // ask_code(0)
      answer(true), // ask_followup depth 1
      answer(true), // ask_followup depth 2
      answer(true), // CAP (codeMaxFollowUps=2): must advance to ask_code(1), not a 3rd follow-up
    ]);
    const followups = effects.filter((e) => e.kind === 'ask_followup');
    expect(followups).toHaveLength(2);
    expect(followups.map((e) => (e as { depth: number }).depth)).toEqual([1, 2]);
    // The event after the cap advances to the second coding question.
    expect(effects[effects.length - 1]).toEqual({ kind: 'ask_code', index: 1 });
  });

  test('oralQuestions=3 asks three oral questions before handoff', () => {
    const cfg = { oralQuestions: 3, coreQuestions: 2, maxFollowUps: 3 };
    let ctx = initialContext(cfg as never);
    const effects: Effect[] = [];
    for (const ev of [
      { type: 'start' },
      answer(),
      answer(),
      answer(),
      answer(),
    ] as InterviewEvent[]) {
      const r = advance(ctx, ev);
      ctx = r.ctx;
      effects.push(r.effect);
    }
    const orals = effects.filter((e) => e.kind === 'ask_oral');
    expect(orals.map((e) => (e as { index: number }).index)).toEqual([0, 1, 2]);
    expect(effects[effects.length - 1].kind).toBe('handoff');
  });

  test('terminal state is stable (further events stay done)', () => {
    let ctx = initialContext();
    ctx = { ...ctx, phase: 'done' };
    const r = advance(ctx, { type: 'answer' });
    expect(r.effect.kind).toBe('done');
    expect(isTerminal(r.ctx)).toBe(true);
  });

  test('oral: unsatisfactory answer → exactly one nudge (same-question re-probe) then advance', () => {
    // Start → greet → oral(0) asked → thin answer → ask_oral_followup(0) → any answer → ask_oral(1)
    let ctx = initialContext();
    // start
    ctx = advance(ctx, { type: 'start' }).ctx;
    // greeting answer → ask_oral(0)
    let res = advance(ctx, { type: 'answer' });
    ctx = res.ctx;
    expect(res.effect).toEqual({ kind: 'ask_oral', index: 0 });

    // thin answer on oral question 0 → should get one nudge
    res = advance(ctx, oralAnswer(true));
    ctx = res.ctx;
    expect(res.effect).toEqual({ kind: 'ask_oral_followup', index: 0 });
    expect(ctx.oralFollowUps).toBe(1);
    expect(ctx.oralAsked).toBe(1); // oralAsked NOT incremented during nudge

    // answer after the nudge → must advance to ask_oral(1), not nudge again
    res = advance(ctx, oralAnswer(true)); // even if oracle still says followUp
    ctx = res.ctx;
    expect(res.effect).toEqual({ kind: 'ask_oral', index: 1 });
    expect(ctx.oralFollowUps).toBe(0); // reset for next question
    expect(ctx.oralAsked).toBe(2);
  });

  test('oral: satisfactory answer → immediate advance, no nudge', () => {
    let ctx = initialContext();
    ctx = advance(ctx, { type: 'start' }).ctx;
    ctx = advance(ctx, { type: 'answer' }).ctx; // greeting → ask_oral(0)

    // good answer → go straight to ask_oral(1)
    const res = advance(ctx, oralAnswer(false));
    expect(res.effect).toEqual({ kind: 'ask_oral', index: 1 });
    expect(res.ctx.oralFollowUps).toBe(0);
    expect(res.ctx.oralAsked).toBe(2);
  });

  test('oral: nudge fires at most once per question — second thin answer on same question is ignored', () => {
    let ctx = initialContext();
    ctx = advance(ctx, { type: 'start' }).ctx;
    ctx = advance(ctx, { type: 'answer' }).ctx; // greeting → ask_oral(0)

    // First thin answer → nudge
    let res = advance(ctx, oralAnswer(true));
    ctx = res.ctx;
    expect(res.effect.kind).toBe('ask_oral_followup');

    // Another thin answer on the same question → must advance, NOT nudge again
    res = advance(ctx, oralAnswer(true));
    expect(res.effect.kind).toBe('ask_oral'); // moved to question 1
    expect(res.ctx.oralFollowUps).toBe(0);
  });

  test('oral: both orals each nudged once → handoff → coding', () => {
    let ctx = initialContext();
    ctx = advance(ctx, { type: 'start' }).ctx;
    ctx = advance(ctx, { type: 'answer' }).ctx; // greeting → ask_oral(0)

    // oral Q0: thin → nudge
    let res = advance(ctx, oralAnswer(true));
    ctx = res.ctx;
    expect(res.effect.kind).toBe('ask_oral_followup');

    // nudge answered (thin again) → advance to Q1
    res = advance(ctx, oralAnswer(true));
    ctx = res.ctx;
    expect(res.effect).toEqual({ kind: 'ask_oral', index: 1 });

    // oral Q1: thin → nudge
    res = advance(ctx, oralAnswer(true));
    ctx = res.ctx;
    expect(res.effect).toEqual({ kind: 'ask_oral_followup', index: 1 });

    // nudge answered → advance to handoff (all orals exhausted)
    res = advance(ctx, oralAnswer(true));
    ctx = res.ctx;
    expect(res.effect.kind).toBe('handoff');

    // handoff answer → coding
    res = advance(ctx, { type: 'answer' });
    expect(res.effect).toEqual({ kind: 'ask_code', index: 0 });
    expect(res.ctx.phase).toBe('coding');
  });

  test('drives end-to-end with the DeterministicOracle within bounded turns', async () => {
    const oracle = new DeterministicOracle();
    let ctx = initialContext();
    let res = advance(ctx, { type: 'start' });
    ctx = res.ctx;
    let effect = res.effect;
    let turns = 0;
    const seen: string[] = [effect.kind];

    // Simulate a candidate who gives short answers in coding (triggers follow-ups,
    // capped by the machine), until the machine reaches 'done'.
    while (effect.kind !== 'done' && turns < 50) {
      turns++;
      let decision: OracleDecision | undefined;
      if (ctx.phase === 'coding') {
        decision = await oracle.evaluateAnswer({ answer: 'short', ctx, transcript: [] });
      }
      res = advance(ctx, { type: 'answer', decision });
      ctx = res.ctx;
      effect = res.effect;
      seen.push(effect.kind);
    }
    expect(isTerminal(ctx)).toBe(true);
    expect(turns).toBeLessThan(50); // bounded — no infinite loop
    expect(seen).toContain('ask_followup');
    expect(seen[seen.length - 1]).toBe('done');
  });
});

// ─────────────────────── SUBMIT mandatory counter-question + MOVE-ON ───────────────────────

import { mustFireCounter } from './machine';
import { SubmitIntent } from './types';

const submit = (followUp?: boolean): InterviewEvent => ({
  type: 'answer',
  intent: 'submit',
  ...(followUp === undefined ? {} : { decision: { followUp, reason: '', signal: 0 } }),
});
const moveOn = (): InterviewEvent => ({ type: 'answer', intent: 'move_on' });
const codeAnswer = (followUp: boolean): InterviewEvent => ({
  type: 'answer', // intent absent ⇒ 'answer'
  decision: { followUp, reason: '', signal: 0 },
});

/** Drive to the coding phase with the first problem asked (ctx: phase='coding', codeIndex=0,
 *  followUps=0), ready for the first coding submit. */
function toCoding(config = undefined as never): InterviewContext {
  let ctx = initialContext(config);
  for (const ev of [
    { type: 'start' } as InterviewEvent,
    answer(), // greeting -> ask_oral(0)
    answer(), // oral -> ask_oral(1)
    answer(), // oral -> handoff
    answer(), // handoff -> ask_code(0)
  ]) {
    ctx = advance(ctx, ev).ctx;
  }
  return ctx;
}

describe('coding: SUBMIT mandatory counter-question', () => {
  test('SUBMIT fires exactly one mandatory counter-question, does NOT advance the problem', () => {
    const ctx = toCoding();
    const { ctx: next, effect } = advance(ctx, submit(false));
    expect(effect).toEqual({ kind: 'ask_followup', codeIndex: 0, depth: 1, mandatory: true });
    expect(next.codeIndex).toBe(0); // stayed on the same problem
    expect(next.followUps).toBe(1);
  });

  test('SUBMIT fires the counter-question EVEN when the oracle declines (survives 429/timeout)', () => {
    // decision.followUp:false simulates an oracle failure/short answer — the machine still probes.
    const { effect } = advance(toCoding(), submit(false));
    expect(effect.kind).toBe('ask_followup');
    expect((effect as { mandatory: boolean }).mandatory).toBe(true);
  });

  test('SUBMIT with no decision at all (oracle threw) still fires the mandatory counter-question', () => {
    const { effect } = advance(toCoding(), { type: 'answer', intent: 'submit' });
    expect(effect.kind).toBe('ask_followup');
    expect((effect as { mandatory: boolean }).mandatory).toBe(true);
  });

  test('after the mandatory CQ is answered (no further follow-up) → advances to the next problem', () => {
    let ctx = toCoding();
    ctx = advance(ctx, submit(false)).ctx; // mandatory CQ, followUps=1
    const { ctx: next, effect } = advance(ctx, codeAnswer(false)); // answer the CQ
    expect(effect).toEqual({ kind: 'ask_code', index: 1 });
    expect(next.codeIndex).toBe(1);
    expect(next.followUps).toBe(0);
  });

  test('a plain coding answer (intent absent) does NOT trigger the mandate', () => {
    const { effect } = advance(toCoding(), codeAnswer(false));
    expect(effect).toEqual({ kind: 'ask_code', index: 1 }); // straight advance, no counter-question
  });

  test('coding follow-ups cap at codeMaxFollowUps (default 2): mandatory + 1 oracle, then advance', () => {
    let ctx = toCoding();
    const kinds: string[] = [];
    ctx = (() => {
      const r = advance(ctx, submit(true));
      kinds.push(r.effect.kind);
      return r.ctx;
    })(); // depth 1 (mandatory)
    const r2 = advance(ctx, codeAnswer(true));
    kinds.push(r2.effect.kind); // depth 2 (oracle)
    const r3 = advance(r2.ctx, codeAnswer(true));
    kinds.push(r3.effect.kind); // CAP → advance
    expect(kinds).toEqual(['ask_followup', 'ask_followup', 'ask_code']);
    expect(r3.effect).toEqual({ kind: 'ask_code', index: 1 });
  });

  test('B3 backward-compat: a config WITHOUT codeMaxFollowUps still fires the mandatory CQ', () => {
    // Legacy shape — the field did not exist when this context was persisted.
    const legacy = { oralQuestions: 2, coreQuestions: 2, maxFollowUps: 3 };
    const { effect } = advance(toCoding(legacy as never), submit(false));
    expect(effect.kind).toBe('ask_followup');
    expect((effect as { mandatory: boolean }).mandatory).toBe(true);
  });

  test('double-SUBMIT does not double-advance or double-fire (2nd submit has followUps>0)', () => {
    let ctx = toCoding();
    ctx = advance(ctx, submit(false)).ctx; // followUps=1 (mandatory fired)
    const { effect } = advance(ctx, submit(false)); // followUps=1 → not mandatory; no oracle followup → advance once
    expect(effect).toEqual({ kind: 'ask_code', index: 1 });
  });
});

describe('coding: MOVE-ON firm skip', () => {
  test('MOVE-ON advances immediately with NO counter-question', () => {
    const { ctx: next, effect } = advance(toCoding(), moveOn());
    expect(effect).toEqual({ kind: 'ask_code', index: 1 });
    expect(next.codeIndex).toBe(1);
  });

  test('MOVE-ON on the LAST problem goes to wrap_up, never a follow-up', () => {
    let ctx = toCoding();
    ctx = advance(ctx, moveOn()).ctx; // -> ask_code(1)
    const { effect } = advance(ctx, moveOn()); // last problem -> wrap_up
    expect(effect).toEqual({ kind: 'wrap_up' });
  });

  test('MOVE-ON ignores any oracle decision (never probes)', () => {
    const { effect } = advance(toCoding(), {
      type: 'answer',
      intent: 'move_on',
      decision: { followUp: true, reason: '', signal: 0 },
    });
    expect(effect.kind).toBe('ask_code');
  });
});

describe('mustFireCounter predicate', () => {
  const cases: [string, SubmitIntent | undefined, number, boolean][] = [
    ['submit, first answer', 'submit', 0, true],
    ['submit, already probed', 'submit', 1, false],
    ['move_on never', 'move_on', 0, false],
    ['plain answer never', 'answer', 0, false],
    ['undefined intent never', undefined, 0, false],
  ];
  test.each(cases)('coding + %s → %s', (_label, intent, followUps, expected) => {
    expect(mustFireCounter('coding', intent, followUps)).toBe(expected);
  });
  test('never fires outside the coding phase', () => {
    expect(mustFireCounter('oral', 'submit', 0)).toBe(false);
    expect(mustFireCounter('wrap_up', 'submit', 0)).toBe(false);
  });
});
