// Core types for the deterministic interview state machine.
// The machine owns ALL control flow. The LLM (oracle) only fills slots and
// returns a bounded decision — it can never choose the next state.

export type Phase = 'greeting' | 'oral' | 'handoff' | 'coding' | 'wrap_up' | 'scoring' | 'done';

export interface InterviewConfig {
  /** Number of oral, experience-based questions before coding (2–3). */
  oralQuestions: number;
  /** Number of core coding questions (spec: 2). */
  coreQuestions: number;
  /** Max adaptive follow-ups per ORAL question path (spec: ≤3). */
  maxFollowUps: number;
  /** Max follow-ups per CODING question: 1 mandatory counter-question (fired on every SUBMIT) +
   *  oracle-driven depth. Optional for backward-compat with contexts persisted before this field —
   *  ALWAYS read it as `config.codeMaxFollowUps ?? 2`, never bare (a legacy `undefined` would make
   *  `followUps < undefined` false and silently disable the mandatory counter-question). */
  codeMaxFollowUps?: number;
}

export const DEFAULT_CONFIG: InterviewConfig = {
  oralQuestions: 2,
  coreQuestions: 2,
  maxFollowUps: 3,
  codeMaxFollowUps: 2,
};

/** Fallback used everywhere `config.codeMaxFollowUps` is read, so a legacy persisted context
 *  (field absent) still enforces the mandatory counter-question. See B3 in docs/CODING_ROUND_REDESIGN.md. */
export const DEFAULT_CODE_MAX_FOLLOWUPS = 2;

/** Serializable machine context — persisted verbatim to `interviews.fsm_state`. */
export interface InterviewContext {
  phase: Phase;
  /** Oral questions asked so far. */
  oralAsked: number;
  /** Current core coding question, 0-based. */
  codeIndex: number;
  /** Follow-ups asked for the current coding question. */
  followUps: number;
  /** Follow-up nudges issued for the CURRENT oral question (hard cap: 1 standard; up to 2 on
   *  the dodge path). Reset to 0 when a new oral question is asked. */
  oralFollowUps: number;
  /** Consecutive dodges on the CURRENT oral question. A dodge is when the oracle judges the
   *  answer NON-RESPONSIVE to the question asked. Resets to 0 on every advance (new question or
   *  handoff) and whenever a non-dodging answer arrives. Optional for backward-compat with
   *  contexts persisted before this field (treated as 0). */
  oralDodges?: number;
  /** Clarifying questions the candidate has asked on the CURRENT question. A clarify is a
   *  non-advancing self-loop (the interviewer answers without moving on); this bounds it so it
   *  can't stall the interview, and resets to 0 whenever a real answer advances the FSM. Optional
   *  for backward-compat with interviews created before this field (treated as 0). */
  clarifyCount?: number;
  /** Resolution of a deep-hint OFFER for a coding question. The offer utterance itself rides on the
   *  code run (race-free); only its RESOLUTION is stored here — and ONLY submitAnswer (the answer
   *  path that owns fsm_state) ever writes it, so there's no cross-path write race. The run path
   *  reads it to know a candidate declined ('declined') or already got the deep hint ('hinted') and
   *  must not re-hint. 'offered' = a Path-C quiescent offer is pending (written under the interview
   *  lock by the quiescent path — maybeResolveHintOffer treats this like an open offer). Absent =
   *  no offer resolved yet for that question. Reset when a real answer advances the FSM. */
  hintOffer?: { codeIndex: number; status: 'declined' | 'hinted' | 'offered' };
  /** Approach-first gate (ENGAGEMENT_INTERVENTIONS): true once the candidate has shared their
   *  approach for the current coding problem (verbally or implicitly via a code run / submit).
   *  Default undefined = false. Reset to false on advanceCoding (per-problem). The gate fires
   *  AT MOST ONE non-mandatory counter_question on the first 'answer' event in the coding phase
   *  if the approach is thin; else a brief acknowledgment. Never increments followUps so the
   *  mandatory SUBMIT counter-question invariant is untouched. */
  codeApproachDone?: boolean;
  /** Unix ms when `ask_code` was last persisted — used by the approach-gate substance guard to
   *  require ≥5 s elapsed before a verbal answer can close the gate (a stale STT tail arriving
   *  <5 s after the problem is shown cannot be a genuine approach plan). Reset per problem. */
  codeAskedAt?: number;
  /** Cumulative verbal coding_ack turns given for the current coding problem — drives the
   *  rotating ack pool so consecutive acks never use the same text. Reset on problem advance. */
  codingAckCount?: number;
  /** True once the one-time approach reminder has been appended to a coding_ack for this
   *  problem ("I'd still love the one-line plan"). At most one reminder per problem. Reset
   *  on problem advance. */
  approachReminderFired?: boolean;
  config: InterviewConfig;
}

/** The kind of autonomous interviewer intervention (USP). `counter_question` challenges a
 *  claim, `probe` digs deeper, `hint` unblocks a stuck candidate, `nudge` is a light prompt,
 *  `encourage` celebrates server-verified progress after a failure streak (advisory only — never
 *  penalized by the scorer). Run-triggered hints are recorded ON the code run that triggered them
 *  (race-free, atomic) — the FSM context stays pure control state. */
export type InterventionKind =
  | 'counter_question'
  | 'probe'
  | 'hint'
  | 'nudge'
  | 'offer'
  | 'encourage';

/** A structured observer note produced by the off-path LLM call (§6.4). Stored in the ring
 *  buffer + persisted as an interview_event; injected into intervention wording (approach/transition
 *  always; diagnosis only at ladder rung ≥ 2). */
export interface ObserverNote {
  /** One-sentence read of what the candidate is attempting architecturally. */
  approach: string;
  /** One-sentence note on how their thinking appears to be shifting between runs. */
  transition: string;
  /** One-sentence root-cause hypothesis for why they are stuck (injected at rung ≥ 2 only). */
  diagnosis: string;
  /** Monotonic sequence slot matching the ring-buffer entry. */
  seq: number;
}

/** What the driver should do next. The machine emits exactly one per step. */
export type Effect =
  | { kind: 'greet' }
  | { kind: 'ask_oral'; index: number; pivot?: true } // 0-based; pivot=true when advancing after 3 consecutive dodges
  | { kind: 'ask_oral_followup'; index: number; ordinal: number; dodgeAck?: true } // re-probe the same oral question; ordinal=1 on first probe, ≥2 auto-sets dodgeAck (name the dodge)
  | { kind: 'handoff'; pivot?: true } // pivot=true when the handoff is a forced advance from dodge #3 on the last oral question
  | { kind: 'ask_code'; index: number } // 0-based core question
  | { kind: 'ask_followup'; codeIndex: number; depth: number; mandatory?: boolean } // depth 1..codeMaxFollowUps; mandatory=the format counter-question fired on SUBMIT
  | { kind: 'coding_ack' } // non-advancing acknowledgment for verbal answers during coding (D2): keeps the floor with the candidate without consuming follow-up budget or advancing the problem
  | { kind: 'wrap_up' }
  | { kind: 'score' }
  | { kind: 'done' };

/** The LLM oracle's bounded decision after a candidate answer in the coding phase. */
export interface OracleDecision {
  followUp: boolean;
  reason: string;
  /** Answer quality/confidence signal, 0..1 — recorded, not control flow. */
  signal: number;
  /** When `followUp`, which kind of follow-up to voice — lets the engine challenge a shaky
   *  claim (counter_question), dig deeper on a thin answer (probe), or unblock (hint). The FSM
   *  still owns whether a follow-up happens (within `maxFollowUps`); this only shapes its tone. */
  kind?: InterventionKind;
  /** True when the answer is NON-RESPONSIVE to the question asked (dodged / answered something
   *  else). Drives the dodge-tracking policy in the oral phase: follow-up with acknowledgment at
   *  dodge #2, pivot at dodge #3. NEVER set by the oracle for coding answers (coding phase uses
   *  the followUp/kind signal only). Parsed with strict boolean coercion — any non-`true` value
   *  (including garbage strings, numbers, undefined) is treated as false by parseDecision. */
  dodged?: boolean;
}

/** How a coding-phase answer was submitted. Absent ⇒ `'answer'` (voice transcripts, oral answers,
 *  and legacy callers are safe by default — only an explicit UI button tap sets submit/move_on). */
export type SubmitIntent = 'answer' | 'submit' | 'move_on';

/** Events the driver feeds the machine. `decision` is only consulted in the coding phase.
 *  `intent` (coding only) drives the SUBMIT mandatory-counter-question and the MOVE-ON firm skip. */
export type InterviewEvent =
  | { type: 'start' }
  | { type: 'answer'; decision?: OracleDecision; intent?: SubmitIntent };

// ─────────────────────── Coding problems (curated bank) ───────────────────────

/** One example shown to the candidate (never a hidden test). */
export interface CodingProblemExample {
  input: string;
  output: string;
  explanation?: string;
}

/** A hidden test: stdin `input` → the program's stdout must equal `expected` (compared trimmed).
 *  NEVER shown to the candidate or returned over the wire. */
export interface CodingProblemTest {
  input: string;
  expected: string;
}

/** A curated, offline-verified coding problem. Stdin→stdout I/O so it's language-agnostic. The
 *  hidden tests give factual correctness; the LLM only words probes/hints, never invents problems. */
export interface CodingProblem {
  slug: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  /** Seniority levels this problem suits: 'junior' | 'mid' | 'senior' | 'staff'. */
  levels: string[];
  tags: string[];
  /** Full statement (markdown) incl. the stdin/stdout I/O format. Presented to the candidate verbatim. */
  statement: string;
  examples: CodingProblemExample[];
  constraints: string;
  /** Optional expert-authored grounding hints per counter-question family (complexity, edge_case,
   *  trade_off, constraint_change, conceptual_ownership) — server-side ONLY, seed the mandatory
   *  counter-question so it stays code-anchored. Stripped by toPublicProblem(). */
  probeHints?: string[];
  /** Hidden tests — server-side only, drive grading + correctness-aware hints. */
  hiddenTests: CodingProblemTest[];
  /** A correct python3 reference (stdin→stdout) used ONLY for offline test verification. Server-side. */
  referencePython: string;
  /** Explicit override for the candidate-visible sample tests used in the visible RUN. When absent,
   *  `sampleTestsOf(p)` falls back to `examples.map(e => ({input: e.input, expected: e.output}))`.
   *  Only needed when a problem's displayed example is illustrative rather than machine-runnable. */
  sampleTests?: CodingProblemTest[];
}

/** Candidate-VISIBLE sample-test outcome (statement examples). Never secret — inputs/expected are
 *  already on the candidate's screen. Rendered by the run card; also read by intervention wording
 *  and scorer so every consumer speaks the same truth the candidate sees. */
export interface SampleResults {
  passed: number;
  total: number;
  /** True if execution short-circuited (crash/timeout) before all samples ran. */
  incomplete?: boolean;
  cases: Array<{
    index: number;      // examples[] index — the room labels it "Example {index+1}"
    input: string;
    expected: string;
    stdout: string;
    stderr: string;
    status: string;     // kernel status for this case ('Accepted' | 'Runtime Error' | ...)
    passed: boolean;    // status==='Accepted' && stdout.trim()===expected.trim()
    timeMs: number | null;
  }>;
}

/** Per-run hidden-test outcome. Persisted on the run + fed to the scorer; NEVER returned to the
 *  candidate (no leak). `cases` records per-test pass/fail (no expected outputs) for audit. */
export interface TestResults {
  passed: number;
  total: number;
  /** True if execution short-circuited (crash/timeout) before all tests ran. */
  incomplete?: boolean;
  cases?: { index: number; passed: boolean }[];
}
