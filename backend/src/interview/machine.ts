// Deterministic interview state machine.
//
// Pure, side-effect-free transitions: `advance(ctx, event) -> { ctx, effect }`.
// The machine is the ONLY thing that decides control flow. The LLM oracle's
// `decision.followUp` is consulted in BOTH the oral and coding phases — always
// within hard caps — the model cannot pick the next state.
//
// Progression:
//   start            -> greet
//   greeting  +answer-> ask_oral(0..oralQuestions-1) one at a time
//   oral      +answer-> ask_oral_followup (if decision.followUp && oralFollowUps===0, ONCE per question)
//                       else next ask_oral, or handoff after the last question
//   oral done +answer-> handoff
//   handoff   +answer-> ask_code(0)
//   coding    +answer-> ask_followup (if decision.followUp && under cap)
//                       else next ask_code, or wrap_up after the last question
//   wrap_up   +answer-> score
//   scoring   +answer-> done   (the "answer" here is the driver's synthetic
//                               post-scoring tick; scoring takes no candidate input)

import { InterviewConfig, InterviewContext, InterviewEvent, Effect, DEFAULT_CONFIG } from './types';

export function initialContext(config: InterviewConfig = DEFAULT_CONFIG): InterviewContext {
  return { phase: 'greeting', oralAsked: 0, codeIndex: 0, followUps: 0, oralFollowUps: 0, config };
}

export interface StepResult {
  ctx: InterviewContext;
  effect: Effect;
}

export function advance(ctx: InterviewContext, event: InterviewEvent): StepResult {
  const { config } = ctx;

  if (event.type === 'start') {
    // Re-entry guard: start only makes sense at the very beginning.
    return { ctx: { ...ctx, phase: 'greeting' }, effect: { kind: 'greet' } };
  }

  // event.type === 'answer'
  switch (ctx.phase) {
    case 'greeting': {
      // Move into the oral phase and ask the first oral question.
      const next = { ...ctx, phase: 'oral' as const, oralAsked: 1 };
      return { ctx: next, effect: { kind: 'ask_oral', index: 0 } };
    }

    case 'oral': {
      // Bounded oral nudge: if the oracle flagged this answer as thin AND we haven't already
      // nudged on this question, re-probe the same question once (don't advance oralAsked).
      const wantsOralNudge = event.decision?.followUp === true;
      if (wantsOralNudge && ctx.oralFollowUps === 0) {
        // Re-probe the current question (oralAsked - 1 is the index of the question just answered).
        const index = ctx.oralAsked - 1;
        return {
          ctx: { ...ctx, oralFollowUps: 1 },
          effect: { kind: 'ask_oral_followup', index },
        };
      }
      // Satisfactory answer, cap already hit, or evaluator unavailable → advance gracefully.
      if (ctx.oralAsked < config.oralQuestions) {
        const index = ctx.oralAsked; // 0-based index of the question being asked now
        return {
          ctx: { ...ctx, oralAsked: ctx.oralAsked + 1, oralFollowUps: 0 },
          effect: { kind: 'ask_oral', index },
        };
      }
      return { ctx: { ...ctx, phase: 'handoff', oralFollowUps: 0 }, effect: { kind: 'handoff' } };
    }

    case 'handoff': {
      const next = { ...ctx, phase: 'coding' as const, codeIndex: 0, followUps: 0 };
      return { ctx: next, effect: { kind: 'ask_code', index: 0 } };
    }

    case 'coding': {
      const wantsFollowUp = event.decision?.followUp === true;
      if (wantsFollowUp && ctx.followUps < config.maxFollowUps) {
        const depth = ctx.followUps + 1;
        return {
          ctx: { ...ctx, followUps: depth },
          effect: { kind: 'ask_followup', codeIndex: ctx.codeIndex, depth },
        };
      }
      // No (more) follow-ups: advance to the next core question, or wrap up.
      if (ctx.codeIndex < config.coreQuestions - 1) {
        const codeIndex = ctx.codeIndex + 1;
        return {
          ctx: { ...ctx, codeIndex, followUps: 0 },
          effect: { kind: 'ask_code', index: codeIndex },
        };
      }
      return { ctx: { ...ctx, phase: 'wrap_up' }, effect: { kind: 'wrap_up' } };
    }

    case 'wrap_up': {
      return { ctx: { ...ctx, phase: 'scoring' }, effect: { kind: 'score' } };
    }

    case 'scoring': {
      return { ctx: { ...ctx, phase: 'done' }, effect: { kind: 'done' } };
    }

    case 'done':
    default: {
      return { ctx: { ...ctx, phase: 'done' }, effect: { kind: 'done' } };
    }
  }
}

/** True once the interview has reached its terminal state. */
export function isTerminal(ctx: InterviewContext): boolean {
  return ctx.phase === 'done';
}
