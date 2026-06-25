// The autonomous intervention policy (USP). Given the live signals + per-question bookkeeping
// (derived from the code-run log itself, so it's race-free), it decides whether — and how — the
// interviewer should step in after a code run, the way a balanced senior interviewer would:
// silent while you're progressing, a gentle probe once you're clearly stuck, a concrete hint if
// you stay stuck, and never nagging (hard budget + cooldown).
//
// Pure + deterministic. The LLM only WORDS the intervention (oracle.generateIntervention); this
// module decides IF and WHICH — so the cadence is testable and can't run away.

import { RunResult } from '../execution/types';
import { InterventionKind } from './types';
import { RunSignals } from './signals';

export interface RunInterventionPolicy {
  /** Max run-triggered hints per coding question (balanced: 2). */
  maxPerQuestion: number;
  /** Min runs (this question) between two hints — gives the candidate room to react (balanced: 2). */
  cooldownRuns: number;
  /** Consecutive failing runs before the first hint fires (balanced: 2 — not jumpy on one typo). */
  minFailuresToTrigger: number;
}

/** Balanced default: probes when genuinely stuck, hints only if it persists, never nags. */
export const BALANCED_RUN_POLICY: RunInterventionPolicy = {
  maxPerQuestion: 2,
  cooldownRuns: 2,
  minFailuresToTrigger: 2,
};

/** Per-question hint budget, derived from the run log (not stored state) so it can't race. */
export interface RunAssistBudget {
  /** Run-triggered hints already given on this question. */
  given: number;
  /** Runs on this question since the last hint (Infinity if none) — drives the cooldown. */
  runsSinceLastHint: number;
}

export interface RunDecision {
  intervene: boolean;
  kind: InterventionKind;
  /** Escalation level: 1 = first (gentle probe), 2 = concrete hint. */
  strength: number;
  reason: string;
}

const QUIET: RunDecision = Object.freeze({
  intervene: false,
  kind: 'nudge',
  strength: 0,
  reason: '',
});

/**
 * Reconstruct the hint budget for the current question from the PRIOR run log (the runs before the
 * one that just landed). Hints are recorded on the run that triggered them, so this is derived,
 * never stored — two overlapping runs can't corrupt a shared counter.
 */
export function deriveRunAssistBudget(priorRuns: RunResult[], codeIndex: number): RunAssistBudget {
  const scoped = priorRuns.filter((r) => r.codeIndex === codeIndex);
  let given = 0;
  let lastHintIdx = -1;
  scoped.forEach((r, i) => {
    if (r.intervention) {
      given++;
      lastHintIdx = i;
    }
  });
  const runsSinceLastHint =
    lastHintIdx === -1 ? Number.POSITIVE_INFINITY : scoped.length - lastHintIdx;
  return { given, runsSinceLastHint };
}

/**
 * Decide whether to intervene after a code run. `signals` should include the run that just landed;
 * `budget` is derived from the PRIOR runs (excluding it). Pure + deterministic.
 */
export function decideRunIntervention(
  signals: RunSignals,
  phase: string,
  budget: RunAssistBudget,
  policy: RunInterventionPolicy = BALANCED_RUN_POLICY
): RunDecision {
  // Only ever intervene during the coding phase.
  if (phase !== 'coding') return QUIET;
  // Stay quiet while progressing — the latest run worked, so the candidate is unblocked.
  if (signals.lastRunPassed) return QUIET;
  // Need a real struggle signal: repeated failures, not a single typo.
  if (signals.consecutiveFailures < policy.minFailuresToTrigger) return QUIET;
  // Per-question budget — a human interviewer doesn't hover over every failure.
  if (budget.given >= policy.maxPerQuestion) return QUIET;
  // Cooldown — never fire two hints within `cooldownRuns` of each other (per question).
  if (budget.runsSinceLastHint < policy.cooldownRuns) return QUIET;

  // Escalation ladder: first a probe (make them reason about the failure), then a concrete hint.
  const strength = budget.given + 1;
  const kind: InterventionKind = budget.given === 0 ? 'probe' : 'hint';
  return {
    intervene: true,
    kind,
    strength,
    reason: `${signals.consecutiveFailures} consecutive failing runs`,
  };
}
