import { advance, initialContext, isTerminal } from './machine';
import { InterviewContext, InterviewEvent, Effect, OracleDecision } from './types';
import { DeterministicOracle } from './oracle';

// Drive the machine through a list of events, collecting the emitted effects.
function run(events: InterviewEvent[], config = undefined as never): { effects: Effect[]; ctx: InterviewContext } {
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
  followUp === undefined ? { type: 'answer' } : { type: 'answer', decision: { followUp, reason: '', signal: 0 } };

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
      'greet', 'ask_oral', 'ask_oral', 'handoff', 'ask_code', 'ask_code', 'wrap_up', 'score', 'done',
    ]);
    expect((effects[1] as { index: number }).index).toBe(0);
    expect((effects[2] as { index: number }).index).toBe(1);
    expect(isTerminal(ctx)).toBe(true);
  });

  test('follow-ups are capped at maxFollowUps (3) even if the oracle keeps asking', () => {
    const { effects } = run([
      { type: 'start' },
      answer(), // ask_oral(0)
      answer(), // ask_oral(1)
      answer(), // handoff
      answer(), // ask_code(0)
      answer(true), // ask_followup depth 1
      answer(true), // ask_followup depth 2
      answer(true), // ask_followup depth 3
      answer(true), // CAP: must advance to ask_code(1), not a 4th follow-up
    ]);
    const followups = effects.filter((e) => e.kind === 'ask_followup');
    expect(followups).toHaveLength(3);
    expect(followups.map((e) => (e as { depth: number }).depth)).toEqual([1, 2, 3]);
    // The event after the cap advances to the second coding question.
    expect(effects[effects.length - 1]).toEqual({ kind: 'ask_code', index: 1 });
  });

  test('oralQuestions=3 asks three oral questions before handoff', () => {
    const cfg = { oralQuestions: 3, coreQuestions: 2, maxFollowUps: 3 };
    let ctx = initialContext(cfg as never);
    const effects: Effect[] = [];
    for (const ev of [{ type: 'start' }, answer(), answer(), answer(), answer()] as InterviewEvent[]) {
      const r = advance(ctx, ev); ctx = r.ctx; effects.push(r.effect);
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
