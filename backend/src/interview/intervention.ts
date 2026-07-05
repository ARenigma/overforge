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

/**
 * Per-question assist state, DERIVED from the run log (not stored) so overlapping runs can't corrupt
 * a shared counter. Note: the deep-hint OFFER is a gate, not an assist — it's tracked separately
 * (offerMade) and excluded from the actual-assist accounting.
 */
export interface RunAssistBudget {
  /** A gentle probe (or counter-question) has fired on this question. */
  probeGiven: boolean;
  /** A deep-hint OFFER has been made on this question (candidate may or may not have responded). */
  offerMade: boolean;
  /** The deep hint has been delivered on this question (via the run path). */
  deepHintGiven: boolean;
  /** Runs since the last actual assist (probe/hint), Infinity if none — drives the post-probe room. */
  runsSinceLastAssist: number;
}

export interface RunDecision {
  intervene: boolean;
  kind: InterventionKind;
  /** Escalation level: 1 = gentle probe, 2 = offer / concrete deep hint. Passed to the oracle so a
   *  deeper rung is worded more specifically than the probe. */
  strength: number;
  reason: string;
}

/** Resolution of a deep-hint offer, read from fsm_state (written only by the answer path). */
export type OfferResolution = 'none' | 'declined' | 'hinted';

const QUIET: RunDecision = Object.freeze({
  intervene: false,
  kind: 'nudge',
  strength: 0,
  reason: '',
});

/**
 * Reconstruct the per-question assist state from the PRIOR run log (the runs before the one that
 * just landed). Interventions are recorded on the run that triggered them, so this is derived,
 * never stored — two overlapping runs can't corrupt a shared counter. The 'offer' kind is a gate,
 * not an assist, so it's tracked separately and never counts toward the probe/hint accounting.
 */
export function deriveRunAssistBudget(priorRuns: RunResult[], codeIndex: number): RunAssistBudget {
  // Exclude synthetic idle markers: their 'nudge' is an idle check-in on the code-run channel, NOT
  // a run-failure assist — counting it would set probeGiven and swallow the candidate's first real
  // run-probe. The idle budget is tracked separately (idleNudgesGiven in signals.ts).
  const scoped = priorRuns.filter((r) => r.codeIndex === codeIndex && r.status !== 'Idle');
  let probeGiven = false;
  let offerMade = false;
  let deepHintGiven = false;
  let lastAssistIdx = -1;
  scoped.forEach((r, i) => {
    const kind = r.intervention?.kind;
    if (!kind) return;
    if (kind === 'offer') {
      offerMade = true;
    } else if (kind === 'hint') {
      deepHintGiven = true;
      lastAssistIdx = i;
    } else {
      probeGiven = true; // probe / counter_question / nudge
      lastAssistIdx = i;
    }
  });
  const runsSinceLastAssist =
    lastAssistIdx === -1 ? Number.POSITIVE_INFINITY : scoped.length - lastAssistIdx;
  return { probeGiven, offerMade, deepHintGiven, runsSinceLastAssist };
}

/**
 * Decide whether/how to intervene after a code run. `signals` includes the run that just landed;
 * `budget` is derived from the PRIOR runs; `offerResolution` comes from fsm_state (how the candidate
 * answered a prior offer). Pure + deterministic.
 *
 * Ladder (per question): gentle PROBE (auto) → after a beat, OFFER a deeper hint (don't inject it) →
 * then the deep HINT is delivered ONLY if the candidate kept failing after the offer (they didn't
 * decline). An accept/decline that arrives via the answer path is recorded as offerResolution and
 * short-circuits here.
 */
export function decideRunIntervention(
  signals: RunSignals,
  phase: string,
  budget: RunAssistBudget,
  offerResolution: OfferResolution = 'none',
  policy: RunInterventionPolicy = BALANCED_RUN_POLICY
): RunDecision {
  if (phase !== 'coding') return QUIET;
  if (signals.lastRunPassed) return QUIET; // unblocked — stay quiet
  if (signals.consecutiveFailures < policy.minFailuresToTrigger) return QUIET; // not a single typo

  // Forward progress DEFERS intervention: the candidate just improved their hidden-test pass count,
  // so they're iterating productively (the exploratory-runner pattern) even though it isn't all
  // green yet. Real interviewers stay quiet while a candidate is visibly moving forward. When the
  // progress plateaus (pass count stops climbing) this clears and the ladder resumes — self-correcting.
  if (signals.passedProgress) return QUIET;

  // Deep rung already resolved: the candidate declined the offer, or already got the deep hint
  // (via the answer path). Never re-hint.
  if (offerResolution === 'declined' || offerResolution === 'hinted') return QUIET;
  if (budget.deepHintGiven) return QUIET; // deep hint already delivered on the run path

  // The candidate was OFFERED a deeper hint and, instead of answering, kept running while failing —
  // they're clearly still stuck, so deliver it now (they had the chance to decline).
  if (budget.offerMade) {
    return {
      intervene: true,
      kind: 'hint',
      strength: 2,
      reason: 'candidate kept failing after the hint offer',
    };
  }

  // First stuck signal → a gentle Socratic probe, automatically (a real interviewer probes freely).
  if (!budget.probeGiven) {
    return { intervene: true, kind: 'probe', strength: 1, reason: 'first repeated failure' };
  }

  // Probe already fired — normally give them room (cooldown) before OFFERing a deeper hint. But if
  // they're STAGNANT (same failing signature run after run), they're spinning on the same wall, so
  // escalate to the offer sooner rather than waiting out the full cooldown. Never auto-inject the deep hint.
  if (!signals.stagnant && budget.runsSinceLastAssist < policy.cooldownRuns) return QUIET;
  return {
    intervene: true,
    kind: 'offer',
    strength: 2,
    reason: signals.stagnant ? 'stagnant after the probe' : 'still stuck after the probe',
  };
}

// ── Path B: STUCK-NOT-RUNNING (idle) intervention ──────────────────────────────
// A human interviewer also steps in for a candidate frozen on a blank editor or paused mid-code
// WITHOUT a failing run to react to. This path is fed by the frontend's compound-idle detector
// (no keystroke AND no run AND not speaking for a protected window — thinking is never punished);
// the server decides IF (cap + phase + resolution gates) and the oracle WORDS a gentle, CONTENT-FREE
// check-in. Because no failing run has been observed, this path NEVER probes a bug, offers, or hints
// — it can only nudge (rung 0). The nudge is persisted as a synthetic 'Idle' run on the code-run
// channel (race-free), so it touches neither fsm_state nor the transcript.

export interface IdleInterventionPolicy {
  /** Max idle check-ins per coding question (balanced: 1 — a single gentle nudge, never nagging). */
  maxIdleNudgesPerQuestion: number;
  /** Editor length (chars) below which the candidate is treated as on a BLANK editor (still
   *  planning / no code) vs having a PARTIAL solution they've paused on. */
  blankCodeMaxChars: number;
}

/** Balanced default: at most one gentle idle check-in per question. */
export const BALANCED_IDLE_POLICY: IdleInterventionPolicy = {
  maxIdleNudgesPerQuestion: 1,
  blankCodeMaxChars: 10,
};

export interface IdleSignals {
  phase: string;
  /** Length of the candidate's current editor content (reported by the client). */
  codeLength: number;
  /** Idle check-ins already delivered on THIS coding question (derived from prior 'Idle' runs). */
  idleNudgesGiven: number;
  /** How the candidate resolved a prior deep-hint offer (fsm_state, read-only): 'declined'/'hinted'
   *  means help was already settled on this question, so an idle check-in would just nag. */
  offerResolution: OfferResolution;
  /** The latest REAL run passed all tests — the candidate has already solved it, so stay quiet. */
  lastRealRunPassed: boolean;
  /** A deep-hint OFFER is still awaiting the candidate's reply (last real run carries an
   *  unresolved 'offer'). Barging in with a check-in on top of our own open question is bad
   *  interviewing — and an interleaved Idle marker would hide the offer from the answer path. */
  pendingOffer: boolean;
}

export interface IdleDecision {
  intervene: boolean;
  kind: InterventionKind;
  strength: number;
  /** Which stuck-mode the check-in addresses — shapes the wording (blank = invite an approach;
   *  partial = invite a walk-through of their existing code). */
  mode: 'blank' | 'partial';
  reason: string;
}

const QUIET_IDLE: IdleDecision = Object.freeze({
  intervene: false,
  kind: 'nudge',
  strength: 0,
  mode: 'blank',
  reason: '',
});

/**
 * Decide whether/how to check in on an idle (stuck-not-running) candidate. Pure + deterministic —
 * the client's compound-idle detector already enforced the protected time window; this layer owns
 * the fairness caps and gates. It can ONLY return a rung-0 nudge (never probe/offer/hint), because
 * no failing run has been observed to reason about.
 */
export function decideIdleIntervention(
  signals: IdleSignals,
  policy: IdleInterventionPolicy = BALANCED_IDLE_POLICY
): IdleDecision {
  if (signals.phase !== 'coding') return QUIET_IDLE;
  // Help already settled on this question (declined or deep hint given) — don't nag with a check-in.
  if (signals.offerResolution === 'declined' || signals.offerResolution === 'hinted')
    return QUIET_IDLE;
  // Our own hint OFFER is still on the table — wait for their reply, never talk over it.
  if (signals.pendingOffer) return QUIET_IDLE;
  // Already solved (last real run all-green) — silence is correct.
  if (signals.lastRealRunPassed) return QUIET_IDLE;
  if (signals.idleNudgesGiven >= policy.maxIdleNudgesPerQuestion) return QUIET_IDLE;
  const mode: 'blank' | 'partial' =
    signals.codeLength < policy.blankCodeMaxChars ? 'blank' : 'partial';
  return { intervene: true, kind: 'nudge', strength: 1, mode, reason: `idle:${mode}` };
}

/**
 * Classify a candidate's reply to a deep-hint offer: 'accept' (wants the hint), 'decline' (keep
 * going on their own), or 'other' (neither — e.g. a clarifying question or an unrelated attempt;
 * the caller leaves the offer open and processes the utterance normally). Pure heuristic — decline
 * is checked first so "no hint" reads as a decline, not an accept. Fast + no LLM cost; an ambiguous
 * reply is 'other', which never forces an unwanted hint.
 */
export function classifyOfferResponse(text: string): 'accept' | 'decline' | 'other' {
  const t = (text ?? '').trim().toLowerCase();
  if (!t) return 'other';
  if (
    /^(no|nope|nah)\b/.test(t) ||
    /\b(keep going|keep trying|i'?m good|i'?m ok|i'?ve got it|got it|on my own|by myself|no thanks|no hint|i'?ll try|let me try|not yet|i'?m fine)\b/.test(
      t
    )
  ) {
    return 'decline';
  }
  if (
    /^(yes|yeah|yep|sure|ok|okay|yea|please)\b/.test(t) ||
    /\b(a hint|the hint|give me|show me|go ahead|i'?d like|pointer|point me|help me|would help|yes please)\b/.test(
      t
    )
  ) {
    return 'accept';
  }
  return 'other';
}
