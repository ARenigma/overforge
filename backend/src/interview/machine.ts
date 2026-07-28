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

import {
  InterviewConfig,
  InterviewContext,
  InterviewEvent,
  Effect,
  Phase,
  SubmitIntent,
  DEFAULT_CONFIG,
  DEFAULT_CODE_MAX_FOLLOWUPS,
} from './types';

/** The coding follow-up cap, read backward-compat safe (B3): a context persisted before
 *  `codeMaxFollowUps` existed must still enforce the mandatory counter-question. */
export function codeFollowUpCap(config: InterviewConfig): number {
  return config.codeMaxFollowUps ?? DEFAULT_CODE_MAX_FOLLOWUPS;
}

/** Pure predicate (exported for direct unit + property testing): the mandatory format
 *  counter-question fires on the FIRST answer of a coding problem submitted via the SUBMIT button.
 *  Keyed on `followUps === 0` so it fires AT MOST ONCE per problem and can never loop. */
export function mustFireCounter(
  phase: Phase,
  intent: SubmitIntent | undefined,
  followUps: number
): boolean {
  return phase === 'coding' && intent === 'submit' && followUps === 0;
}

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
      const isDodge = event.decision?.dodged === true;
      const wantsOralNudge = event.decision?.followUp === true;
      // Consecutive-dodge counter: a non-dodge answer resets it to 0.
      const newOralDodges = isDodge ? (ctx.oralDodges ?? 0) + 1 : 0;
      const cap = config.maxFollowUps; // DEFAULT_CONFIG.maxFollowUps = 3

      // Pivot at 3 consecutive dodges — advance immediately, never issue another follow-up.
      // The wording layer uses pivot:true to emit a graceful "No problem — let's move on" line.
      if (newOralDodges >= 3) {
        if (ctx.oralAsked < config.oralQuestions) {
          const index = ctx.oralAsked;
          return {
            ctx: { ...ctx, oralAsked: ctx.oralAsked + 1, oralFollowUps: 0, oralDodges: 0 },
            effect: { kind: 'ask_oral', index, pivot: true },
          };
        }
        return {
          ctx: { ...ctx, phase: 'handoff', oralFollowUps: 0, oralDodges: 0 },
          effect: { kind: 'handoff', pivot: true },
        };
      }

      // Dodge #2: acknowledge the dodge explicitly and re-ask once (if budget remains).
      // dodgeAck:true tells the wording layer to name what's missing rather than probe generically.
      if (newOralDodges === 2 && ctx.oralFollowUps < cap) {
        const index = ctx.oralAsked - 1;
        return {
          ctx: { ...ctx, oralFollowUps: ctx.oralFollowUps + 1, oralDodges: 2 },
          effect: { kind: 'ask_oral_followup', index, ordinal: ctx.oralFollowUps + 1, dodgeAck: true },
        };
      }

      // Dodge #1 or thin answer (existing behavior): one standard follow-up when no nudge has been
      // issued yet on this question. isDodge fires the follow-up even if followUp is false (a
      // non-responsive answer is always worth re-probing once).
      if ((isDodge || wantsOralNudge) && ctx.oralFollowUps === 0) {
        const index = ctx.oralAsked - 1;
        return {
          ctx: { ...ctx, oralFollowUps: 1, oralDodges: newOralDodges },
          effect: { kind: 'ask_oral_followup', index, ordinal: 1 },
        };
      }

      // Satisfactory answer, cap hit, or evaluator unavailable → advance gracefully.
      if (ctx.oralAsked < config.oralQuestions) {
        const index = ctx.oralAsked;
        return {
          ctx: { ...ctx, oralAsked: ctx.oralAsked + 1, oralFollowUps: 0, oralDodges: 0 },
          effect: { kind: 'ask_oral', index },
        };
      }
      return {
        ctx: { ...ctx, phase: 'handoff', oralFollowUps: 0, oralDodges: 0 },
        effect: { kind: 'handoff' },
      };
    }

    case 'handoff': {
      // codeApproachDone: false — the approach gate is fresh for the first coding problem.
      const next = { ...ctx, phase: 'coding' as const, codeIndex: 0, followUps: 0, codeApproachDone: false };
      return { ctx: next, effect: { kind: 'ask_code', index: 0 } };
    }

    case 'coding': {
      // MOVE-ON: a firm, candidate-chosen forward skip. No oracle, no probe — advance immediately.
      if (event.intent === 'move_on') {
        return advanceCoding(ctx);
      }

      const cap = codeFollowUpCap(config);
      const wantsFollowUp = event.decision?.followUp === true;
      // SUBMIT always earns ONE counter-question (the USP + anti-cheat moat), machine-enforced —
      // NOT gated on the oracle's followUp, so it survives a 429/timeout. Fires once (followUps===0).
      const mandatoryProbe = mustFireCounter(ctx.phase, event.intent, ctx.followUps);

      if ((wantsFollowUp || mandatoryProbe) && ctx.followUps < cap) {
        const depth = ctx.followUps + 1;
        return {
          ctx: { ...ctx, followUps: depth },
          effect: {
            kind: 'ask_followup',
            codeIndex: ctx.codeIndex,
            depth,
            mandatory: mandatoryProbe,
          },
        };
      }
      // No (more) follow-ups: advance to the next core question, or wrap up.
      return advanceCoding(ctx);
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

/** Single-source coding advance: next core question, or wrap-up after the last. Used by BOTH the
 *  no-follow-up path and (Phase 1) the MOVE-ON firm skip, so they can never diverge. Resets
 *  followUps and codeApproachDone for the new question. Pure. */
function advanceCoding(ctx: InterviewContext): StepResult {
  const { config } = ctx;
  if (ctx.codeIndex < config.coreQuestions - 1) {
    const codeIndex = ctx.codeIndex + 1;
    return {
      // codeApproachDone: false resets the approach gate for each new coding problem.
      ctx: { ...ctx, codeIndex, followUps: 0, codeApproachDone: false },
      effect: { kind: 'ask_code', index: codeIndex },
    };
  }
  return { ctx: { ...ctx, phase: 'wrap_up' }, effect: { kind: 'wrap_up' } };
}

/** True once the interview has reached its terminal state. */
export function isTerminal(ctx: InterviewContext): boolean {
  return ctx.phase === 'done';
}
