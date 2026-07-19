// Property-based proof of the machine invariants (docs/CODING_ROUND_REDESIGN.md §5). Scenario tests
// pick example inputs; these assert the invariants for THOUSANDS of random event sequences — the only
// way to prove "a counter-question fires for EVERY submit" and to kill the `followUps === 0` → `< 0`
// mutation that passes every example test. Kept at the pure-machine layer (the orchestrator layer is
// covered separately in orchestrator.test.ts — that is where the real-world blockers live).

import fc from 'fast-check';
import { advance, initialContext, isTerminal, codeFollowUpCap } from './machine';
import { InterviewConfig, InterviewContext, InterviewEvent, Phase, SubmitIntent } from './types';

const PHASE_ORDER: Phase[] = [
  'greeting',
  'oral',
  'handoff',
  'coding',
  'wrap_up',
  'scoring',
  'done',
];
const phaseRank = (p: Phase) => PHASE_ORDER.indexOf(p);

// A random config within sane bounds (exercises legacy shape WITHOUT codeMaxFollowUps too — B3).
const arbConfig: fc.Arbitrary<InterviewConfig> = fc.record({
  oralQuestions: fc.integer({ min: 1, max: 3 }),
  coreQuestions: fc.integer({ min: 1, max: 3 }),
  maxFollowUps: fc.integer({ min: 1, max: 3 }),
  codeMaxFollowUps: fc.option(fc.integer({ min: 1, max: 3 }), { nil: undefined }),
});

const arbIntent: fc.Arbitrary<SubmitIntent | undefined> = fc.constantFrom(
  'answer',
  'submit',
  'move_on',
  undefined
);

// Only ANSWER events are randomized. `{type:'start'}` is a once-only begin event (the orchestrator's
// claimBegin CAS guards re-entry; the answer path never emits it), so injecting it mid-sequence would
// model an unreachable state — the machine's start handler intentionally re-seeds phase='greeting'.
const arbEvent: fc.Arbitrary<InterviewEvent> = fc
  .record({ followUp: fc.boolean(), intent: arbIntent })
  .map(
    ({ followUp, intent }) =>
      ({
        type: 'answer',
        decision: { followUp, reason: 'prop', signal: 0.5 },
        ...(intent === undefined ? {} : { intent }),
      }) as InterviewEvent
  );

/** Assert every invariant that must hold for ANY reachable context. */
function assertInvariants(ctx: InterviewContext): void {
  expect(PHASE_ORDER).toContain(ctx.phase);
  expect(ctx.codeIndex).toBeGreaterThanOrEqual(0);
  expect(ctx.codeIndex).toBeLessThanOrEqual(ctx.config.coreQuestions);
  expect(ctx.followUps).toBeGreaterThanOrEqual(0);
  // followUps never exceeds whichever cap governs the current phase.
  const cap = Math.max(ctx.config.maxFollowUps, codeFollowUpCap(ctx.config));
  expect(ctx.followUps).toBeLessThanOrEqual(cap);
}

describe('machine invariants (property-based)', () => {
  test('FORWARD_ONLY + phase-monotonic + caps hold across any random event sequence', () => {
    fc.assert(
      fc.property(
        arbConfig,
        fc.array(arbEvent, { minLength: 1, maxLength: 40 }),
        (config, events) => {
          let ctx = initialContext(config);
          let prevCodeIndex = ctx.codeIndex;
          let prevRank = phaseRank(ctx.phase);
          for (const ev of events) {
            const { ctx: next } = advance(ctx, ev);
            assertInvariants(next);
            expect(next.codeIndex).toBeGreaterThanOrEqual(prevCodeIndex); // never rewinds a problem
            expect(phaseRank(next.phase)).toBeGreaterThanOrEqual(prevRank); // never regresses a phase
            prevCodeIndex = next.codeIndex;
            prevRank = phaseRank(next.phase);
            ctx = next;
          }
        }
      ),
      { numRuns: 500 }
    );
  });

  test('MANDATORY_COUNTER: in coding at followUps=0, SUBMIT ALWAYS yields a mandatory counter-question — even when the oracle declines (kills the ===0→<0 mutation)', () => {
    fc.assert(
      fc.property(arbConfig, (config) => {
        // Reach coding with the first problem asked (followUps=0). Drive greeting→…→ask_code(0).
        let ctx = initialContext(config);
        // enough plain answers to clear oral (≤3) + handoff regardless of config
        const plain: InterviewEvent = {
          type: 'answer',
          decision: { followUp: false, reason: '', signal: 1 },
        };
        ctx = advance(ctx, { type: 'start' }).ctx;
        while (ctx.phase !== 'coding') ctx = advance(ctx, plain).ctx;
        expect(ctx.followUps).toBe(0);
        // SUBMIT with the oracle explicitly NOT wanting a follow-up → only the mandate can probe.
        const { effect } = advance(ctx, {
          type: 'answer',
          intent: 'submit',
          decision: { followUp: false, reason: '', signal: 1 },
        });
        expect(effect.kind).toBe('ask_followup');
        expect((effect as { mandatory: boolean }).mandatory).toBe(true);
      }),
      { numRuns: 300 }
    );
  });

  test('NO_AUTO_ADVANCE_ON_SUBMIT: a fresh SUBMIT never emits an advance effect (ask_code/wrap_up) on the same step', () => {
    fc.assert(
      fc.property(arbConfig, fc.boolean(), (config, oracleWants) => {
        let ctx = initialContext(config);
        const plain: InterviewEvent = {
          type: 'answer',
          decision: { followUp: false, reason: '', signal: 1 },
        };
        ctx = advance(ctx, { type: 'start' }).ctx;
        while (ctx.phase !== 'coding') ctx = advance(ctx, plain).ctx;
        const { effect } = advance(ctx, {
          type: 'answer',
          intent: 'submit',
          decision: { followUp: oracleWants, reason: '', signal: 0.5 },
        });
        expect(effect.kind).toBe('ask_followup'); // never ask_code / wrap_up on the submit step
      }),
      { numRuns: 200 }
    );
  });

  test('TERMINATION: repeated MOVE-ON from coding reaches done within coreQuestions + 3 steps', () => {
    fc.assert(
      fc.property(arbConfig, (config) => {
        let ctx = initialContext(config);
        const plain: InterviewEvent = {
          type: 'answer',
          decision: { followUp: false, reason: '', signal: 1 },
        };
        const moveOn: InterviewEvent = { type: 'answer', intent: 'move_on' };
        ctx = advance(ctx, { type: 'start' }).ctx;
        while (ctx.phase !== 'coding') ctx = advance(ctx, plain).ctx;
        let steps = 0;
        // move_on through all coding problems, then plain answers through wrap_up/scoring.
        while (!isTerminal(ctx) && steps < config.coreQuestions + 6) {
          ctx = advance(ctx, ctx.phase === 'coding' ? moveOn : plain).ctx;
          steps++;
        }
        expect(isTerminal(ctx)).toBe(true);
      }),
      { numRuns: 200 }
    );
  });
});
