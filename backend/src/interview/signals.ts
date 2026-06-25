// Live candidate signals derived from already-captured interview data (code runs). No new
// capture — the autonomous intervention engine reads these to decide when a human interviewer
// would step in. Pure + deterministic so the policy on top of it is unit-testable.

import { RunResult } from '../execution/types';

export interface RunSignals {
  /** Code runs attributed to the current coding question. */
  runsThisQuestion: number;
  /** Trailing consecutive failing runs (this question) — the core "stuck" signal. */
  consecutiveFailures: number;
  /** Status of the most recent run. */
  lastStatus: string;
  /** The latest run ran clean — the candidate is unblocked, so the interviewer stays quiet. */
  lastRunPassed: boolean;
  /** The latest run produced error output (stderr / compile output) to reason about. */
  hasErrorOutput: boolean;
}

/** A run "passed" if it ran clean: Accepted status, no error exit, no stderr. The interview IDE
 *  has no hidden test cases, so this means "the program executed without error" — the best
 *  available proxy for forward progress. */
export function runPassed(r: RunResult): boolean {
  const cleanExit = r.exitCode === 0 || r.exitCode === null;
  const noStderr = !(r.stderr && r.stderr.trim());
  return r.status === 'Accepted' && cleanExit && noStderr;
}

/** Derive the live struggle/progress signals for the current coding question from the run log. */
export function deriveRunSignals(runs: RunResult[], codeIndex: number): RunSignals {
  // Attribute runs to the current question when tagged. Only the first question (codeIndex 0)
  // falls back to the whole log for legacy rows that predate the codeIndex tag — a later question
  // with no tagged runs must NOT inherit an earlier question's failure streak.
  const tagged = runs.filter((r) => r.codeIndex === codeIndex);
  const scoped = tagged.length > 0 ? tagged : codeIndex === 0 ? runs : [];
  const last = scoped[scoped.length - 1];

  let consecutiveFailures = 0;
  for (let i = scoped.length - 1; i >= 0; i--) {
    if (runPassed(scoped[i])) break;
    consecutiveFailures++;
  }

  const hasErrorOutput = !!(
    last &&
    ((last.stderr && last.stderr.trim()) || (last.compileOutput && last.compileOutput.trim()))
  );

  return {
    runsThisQuestion: scoped.length,
    consecutiveFailures,
    lastStatus: last?.status ?? '',
    lastRunPassed: last ? runPassed(last) : false,
    hasErrorOutput,
  };
}
