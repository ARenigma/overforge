// Core types for the deterministic interview state machine.
// The machine owns ALL control flow. The LLM (oracle) only fills slots and
// returns a bounded decision — it can never choose the next state.

export type Phase = 'greeting' | 'oral' | 'handoff' | 'coding' | 'wrap_up' | 'scoring' | 'done';

export interface InterviewConfig {
  /** Number of oral, experience-based questions before coding (2–3). */
  oralQuestions: number;
  /** Number of core coding questions (spec: 2). */
  coreQuestions: number;
  /** Max adaptive follow-ups per coding question (spec: ≤3). */
  maxFollowUps: number;
}

export const DEFAULT_CONFIG: InterviewConfig = {
  oralQuestions: 2,
  coreQuestions: 2,
  maxFollowUps: 3,
};

/** Serializable machine context — persisted verbatim to `interviews.fsm_state`. */
export interface InterviewContext {
  phase: Phase;
  /** Oral questions asked so far. */
  oralAsked: number;
  /** Current core coding question, 0-based. */
  codeIndex: number;
  /** Follow-ups asked for the current coding question. */
  followUps: number;
  /** Follow-up nudges issued for the CURRENT oral question (hard cap: 1). Reset to 0 when a
   *  new oral question is asked. Kept at 0 during non-oral phases. */
  oralFollowUps: number;
  config: InterviewConfig;
}

/** The kind of autonomous interviewer intervention (USP). `counter_question` challenges a
 *  claim, `probe` digs deeper, `hint` unblocks a stuck candidate, `nudge` is a light prompt.
 *  Run-triggered hints are recorded ON the code run that triggered them (race-free, atomic) — the
 *  FSM context stays pure control state. */
export type InterventionKind = 'counter_question' | 'probe' | 'hint' | 'nudge';

/** What the driver should do next. The machine emits exactly one per step. */
export type Effect =
  | { kind: 'greet' }
  | { kind: 'ask_oral'; index: number } // 0-based
  | { kind: 'ask_oral_followup'; index: number } // re-probe the same oral question (max 1 per question)
  | { kind: 'handoff' }
  | { kind: 'ask_code'; index: number } // 0-based core question
  | { kind: 'ask_followup'; codeIndex: number; depth: number } // depth 1..maxFollowUps
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
}

/** Events the driver feeds the machine. `decision` is only consulted in the coding phase. */
export type InterviewEvent = { type: 'start' } | { type: 'answer'; decision?: OracleDecision };

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
  /** Hidden tests — server-side only, drive grading + correctness-aware hints. */
  hiddenTests: CodingProblemTest[];
  /** A correct python3 reference (stdin→stdout) used ONLY for offline test verification. Server-side. */
  referencePython: string;
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
