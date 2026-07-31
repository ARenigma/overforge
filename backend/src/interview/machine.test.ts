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
    // D2: verbal answers (intent absent/='answer') never advance coding — only explicit
    // submit/move_on may. Use move_on for the cleanest "no follow-ups" coding path.
    const { effects, ctx } = run([
      { type: 'start' },
      answer(), // greeting -> ask_oral(0)
      answer(), // oral -> ask_oral(1)
      answer(), // oral done -> handoff
      answer(), // handoff -> ask_code(0)
      moveOn(), // code0 -> ask_code(1)  [D2: was answer(false), now requires explicit intent]
      moveOn(), // code1 -> wrap_up      [D2: was answer(false), now requires explicit intent]
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
    // D2: verbal answers at the cap emit coding_ack (not advance). The advance only fires on
    // an explicit submit/move_on. Use submit at the cap point to show the cap-then-advance path.
    const { effects } = run([
      { type: 'start' },
      answer(), // ask_oral(0)
      answer(), // ask_oral(1)
      answer(), // handoff
      answer(), // ask_code(0)
      answer(true), // ask_followup depth 1   (verbal, oracle wants followUp, followUps=0→1)
      answer(true), // ask_followup depth 2   (verbal, oracle wants followUp, followUps=1→2)
      // D2: verbal at cap → coding_ack; use submit so the cap-then-advance fires instead.
      { type: 'answer', intent: 'submit', decision: { followUp: true, reason: '', signal: 0 } } as InterviewEvent,
    ]);
    const followups = effects.filter((e) => e.kind === 'ask_followup');
    expect(followups).toHaveLength(2);
    expect(followups.map((e) => (e as { depth: number }).depth)).toEqual([1, 2]);
    // The event after the cap (explicit submit) advances to the second coding question.
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
    expect(res.effect).toEqual({ kind: 'ask_oral_followup', index: 0, ordinal: 1 });
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
    expect(res.effect).toEqual({ kind: 'ask_oral_followup', index: 1, ordinal: 1 });

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
    // D2: verbal answers (intent absent) never advance coding; use 'submit' intent so this
    // simulation terminates. The invariant under test (ask_followup appears) still holds because
    // the mandatory counter-question fires on the first submit (followUps===0).
    while (effect.kind !== 'done' && turns < 50) {
      turns++;
      let decision: OracleDecision | undefined;
      if (ctx.phase === 'coding') {
        decision = await oracle.evaluateAnswer({ answer: 'short', ctx, transcript: [] });
      }
      res = advance(ctx, {
        type: 'answer',
        decision,
        // Only explicit submit/move_on advances coding — use submit to drive the simulation.
        ...(ctx.phase === 'coding' ? { intent: 'submit' as const } : {}),
      });
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

  test('after the mandatory CQ, a second SUBMIT (no further oracle follow-up) advances to the next problem', () => {
    // D2: the answer to the CQ must be an explicit submit/move_on — a verbal answer gives coding_ack.
    let ctx = toCoding();
    ctx = advance(ctx, submit(false)).ctx; // mandatory CQ, followUps=1
    // submit with followUps=1, oracle declines → mandatoryProbe=false, no followUp → advanceCoding.
    const { ctx: next, effect } = advance(ctx, submit(false)); // D2: was codeAnswer(false)
    expect(effect).toEqual({ kind: 'ask_code', index: 1 });
    expect(next.codeIndex).toBe(1);
    expect(next.followUps).toBe(0);
  });

  test('a plain coding answer (intent absent) does NOT trigger the mandate and emits coding_ack', () => {
    // D2: before D2 this gave ask_code (straight advance); now verbal answers give coding_ack.
    // The mandatory counter-question invariant is unchanged: it only fires on intent='submit'.
    const { effect } = advance(toCoding(), codeAnswer(false));
    expect(effect.kind).toBe('coding_ack'); // D2: verbal → coding_ack, never ask_code or mandate
  });

  test('coding follow-ups cap at codeMaxFollowUps (default 2): mandatory + 1 oracle, then advance on submit', () => {
    // D2: verbal answer at the cap gives coding_ack (not advance). Use submit at the cap point.
    let ctx = toCoding();
    const kinds: string[] = [];
    ctx = (() => {
      const r = advance(ctx, submit(true));
      kinds.push(r.effect.kind);
      return r.ctx;
    })(); // depth 1 (mandatory)
    const r2 = advance(ctx, codeAnswer(true));
    kinds.push(r2.effect.kind); // depth 2 (oracle — verbal within cap, followUp=true → ask_followup)
    // D2: verbal at cap → coding_ack; use submit so the cap-then-advance fires.
    const r3 = advance(r2.ctx, submit(true));
    kinds.push(r3.effect.kind); // CAP + submit → advance
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

// ─────────────────────── Oral: dodge-acknowledgment + pivot policy ───────────────────────

/** Produce an oral answer event with explicit followUp AND dodged signals. */
const dodgeAnswer = (followUp = true): InterviewEvent => ({
  type: 'answer',
  decision: { followUp, reason: 'dodge', signal: 0.1, dodged: true },
});

/** Drive to the start of oral Q0 (phase=oral, oralAsked=1, oralFollowUps=0, oralDodges=0). */
function toOral(config = undefined as never): InterviewContext {
  let ctx = initialContext(config);
  ctx = advance(ctx, { type: 'start' }).ctx; // → greeting
  ctx = advance(ctx, { type: 'answer' }).ctx; // greeting answer → ask_oral(0)
  return ctx;
}

describe('oral: dodge-acknowledgment and pivot', () => {
  test('dodge #1 → normal ask_oral_followup (no dodgeAck), oralDodges set to 1', () => {
    const ctx = toOral();
    const { ctx: next, effect } = advance(ctx, dodgeAnswer());
    expect(effect).toEqual({ kind: 'ask_oral_followup', index: 0, ordinal: 1 }); // no dodgeAck
    expect(next.oralFollowUps).toBe(1);
    expect(next.oralDodges).toBe(1);
    expect(next.oralAsked).toBe(1); // stayed on Q0
  });

  test('dodge #2 → ask_oral_followup with dodgeAck:true', () => {
    let ctx = toOral();
    ctx = advance(ctx, dodgeAnswer()).ctx; // dodge #1 → follow-up, oralDodges=1
    const { ctx: next, effect } = advance(ctx, dodgeAnswer()); // dodge #2
    expect(effect).toEqual({ kind: 'ask_oral_followup', index: 0, ordinal: 2, dodgeAck: true });
    expect(next.oralFollowUps).toBe(2);
    expect(next.oralDodges).toBe(2);
    expect(next.oralAsked).toBe(1); // still on Q0
  });

  test('dodge #3 → pivot: advances to ask_oral(1) with pivot:true, resets counters', () => {
    let ctx = toOral();
    ctx = advance(ctx, dodgeAnswer()).ctx; // dodge #1
    ctx = advance(ctx, dodgeAnswer()).ctx; // dodge #2
    const { ctx: next, effect } = advance(ctx, dodgeAnswer()); // dodge #3 → pivot
    expect(effect).toEqual({ kind: 'ask_oral', index: 1, pivot: true });
    expect(next.oralFollowUps).toBe(0);
    expect(next.oralDodges).toBe(0);
    expect(next.oralAsked).toBe(2);
  });

  test('dodge #3 at the LAST oral question → handoff with pivot:true', () => {
    let ctx = toOral(); // oralAsked=1, config.oralQuestions=2 → one more Q remaining
    ctx = advance(ctx, answer()).ctx; // advance to oral Q1 (oralAsked=2)
    // Now on Q1 (last): 3 dodges → should go to handoff
    ctx = advance(ctx, dodgeAnswer()).ctx; // dodge #1
    ctx = advance(ctx, dodgeAnswer()).ctx; // dodge #2
    const { ctx: next, effect } = advance(ctx, dodgeAnswer()); // dodge #3 → handoff pivot
    expect(effect).toEqual({ kind: 'handoff', pivot: true });
    expect(next.phase).toBe('handoff');
    expect(next.oralDodges).toBe(0);
  });

  test('non-dodge answer resets oralDodges to 0', () => {
    let ctx = toOral();
    ctx = advance(ctx, dodgeAnswer()).ctx; // dodge #1, oralDodges=1
    // Now answer the follow-up WITHOUT dodging — counter resets
    const { ctx: next, effect } = advance(ctx, answer(false)); // substantive, not a dodge
    expect(effect.kind).toBe('ask_oral'); // advances to next question
    expect(next.oralDodges).toBe(0);
  });

  test('non-dodge thin answer (followUp=true, dodged=false) fires normal follow-up, oralDodges stays 0', () => {
    const ctx = toOral();
    const { ctx: next, effect } = advance(ctx, oralAnswer(true)); // thin, NOT a dodge
    expect(effect).toEqual({ kind: 'ask_oral_followup', index: 0, ordinal: 1 }); // no dodgeAck
    expect(next.oralDodges).toBe(0);
    expect(next.oralFollowUps).toBe(1);
  });

  test('maxFollowUps cap: dodge #2 does NOT fire when oralFollowUps is already at cap', () => {
    // Use a config with maxFollowUps=1 so the cap is hit after dodge #1.
    const tightConfig = { oralQuestions: 2, coreQuestions: 2, maxFollowUps: 1 };
    let ctx = toOral(tightConfig as never);
    ctx = advance(ctx, dodgeAnswer()).ctx; // dodge #1 → follow-up, oralFollowUps=1 (= cap)
    // Dodge #2: oralFollowUps(1) < cap(1) is false → fall through to advance
    const { effect } = advance(ctx, dodgeAnswer()); // dodge #2, but cap hit
    expect(effect.kind).toBe('ask_oral'); // advances, not another follow-up
    expect((effect as { dodgeAck?: boolean }).dodgeAck).toBeUndefined();
  });

  test('pivot fires an ask_oral advance (not a follow-up), so maxFollowUps is never exceeded', () => {
    let ctx = toOral();
    ctx = advance(ctx, dodgeAnswer()).ctx; // dodge #1
    ctx = advance(ctx, dodgeAnswer()).ctx; // dodge #2
    // At this point oralFollowUps=2, oralDodges=2
    const { effect } = advance(ctx, dodgeAnswer()); // dodge #3 → pivot
    expect(effect.kind).toBe('ask_oral'); // it's an advance, not ask_oral_followup
    expect(effect).toMatchObject({ pivot: true });
  });

  test('oralDodges resets for the next oral question after a normal advance', () => {
    let ctx = toOral();
    // Accumulate one dodge on Q0
    ctx = advance(ctx, dodgeAnswer()).ctx; // dodge #1, oralDodges=1
    // Non-dodging follow-up answer → advance to Q1
    ctx = advance(ctx, answer(false)).ctx;
    expect(ctx.oralDodges).toBe(0); // reset on advance
    expect(ctx.oralFollowUps).toBe(0);
    // On Q1, a dodge should start fresh at 1
    const { ctx: after, effect } = advance(ctx, dodgeAnswer());
    expect(effect).toEqual({ kind: 'ask_oral_followup', index: 1, ordinal: 1 });
    expect(after.oralDodges).toBe(1);
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

// ─────────────────────── D2 — verbal answers never advance coding ───────────────────────
//
// Only explicit SUBMIT or MOVE-ON may call advanceCoding. A verbal answer (intent absent
// or 'answer') that would otherwise fall through to advanceCoding must instead emit
// coding_ack — a brief, non-advancing, non-penalizable acknowledgment.

describe('coding: D2 — verbal answers never advance the coding problem', () => {
  test('verbal answer with no oracle follow-up (would have advanced before D2) emits coding_ack', () => {
    // Pre-D2 this path called advanceCoding; now it must return coding_ack unchanged.
    const ctx = toCoding();
    const { ctx: next, effect } = advance(ctx, codeAnswer(false)); // oracle says no follow-up
    expect(effect.kind).toBe('coding_ack');
    expect(next.codeIndex).toBe(0); // problem unchanged
    expect(next.followUps).toBe(0); // budget unchanged
    expect(next.phase).toBe('coding');
  });

  test('verbal answer with intent="answer" also emits coding_ack, not advance', () => {
    const ctx = toCoding();
    const { ctx: next, effect } = advance(ctx, {
      type: 'answer',
      intent: 'answer',
      decision: { followUp: false, reason: '', signal: 0.9 },
    });
    expect(effect.kind).toBe('coding_ack');
    expect(next.codeIndex).toBe(0);
    expect(next.followUps).toBe(0);
  });

  test('verbal answer with budget exhausted (followUps===cap) emits coding_ack, not advance', () => {
    // Exhaust the budget: SUBMIT fires the mandatory CQ (followUps=1), then a verbal answer
    // with oracle followUp=true pushes followUps to cap (2).
    let ctx = toCoding();
    ctx = advance(ctx, submit(false)).ctx; // mandatory CQ → followUps=1
    ctx = advance(ctx, codeAnswer(true)).ctx; // oracle follow-up → followUps=2 (cap hit)
    // Now followUps=2===cap. A verbal answer must emit coding_ack, NOT advanceCoding.
    const { ctx: next, effect } = advance(ctx, codeAnswer(false));
    expect(effect.kind).toBe('coding_ack');
    expect(next.codeIndex).toBe(0); // still on problem 0
    expect(next.followUps).toBe(2); // budget unchanged
    expect(next.phase).toBe('coding');
  });

  test('SUBMIT with budget exhausted advances normally (not coding_ack) — only verbal is blocked', () => {
    let ctx = toCoding();
    ctx = advance(ctx, submit(false)).ctx; // mandatory CQ → followUps=1
    ctx = advance(ctx, codeAnswer(true)).ctx; // oracle follow-up → followUps=2 (cap)
    // Explicit submit at cap: intent='submit' is NOT a verbal answer → advanceCoding.
    const { ctx: next, effect } = advance(ctx, submit(false));
    expect(effect).toEqual({ kind: 'ask_code', index: 1 });
    expect(next.codeIndex).toBe(1);
    expect(next.followUps).toBe(0);
  });

  test('MOVE-ON still advances immediately regardless of budget', () => {
    const ctx = toCoding();
    const { effect } = advance(ctx, moveOn());
    expect(effect).toEqual({ kind: 'ask_code', index: 1 });
  });

  test('coding_ack does not appear in the effects when SUBMIT is used throughout', () => {
    // Regression guard: a submit-driven session must never produce coding_ack.
    let ctx = toCoding();
    const effects: string[] = [];
    // Two problems × (mandatory CQ + advance) = 4 submit events to reach wrap_up.
    for (let i = 0; i < 6 && ctx.phase !== 'wrap_up'; i++) {
      const r = advance(ctx, submit(false));
      effects.push(r.effect.kind);
      ctx = r.ctx;
    }
    expect(effects).not.toContain('coding_ack');
    expect(ctx.phase).toBe('wrap_up');
  });
});
