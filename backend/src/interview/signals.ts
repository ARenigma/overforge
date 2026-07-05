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
  /** The latest run improved on the best hidden-test pass count seen earlier this question — the
   *  candidate is iterating FORWARD (exploratory / partial progress), so a real interviewer holds
   *  off even if it's still failing. Only meaningful when the problem has hidden tests; false when
   *  the latest run passed (that's handled by lastRunPassed) or when there are no tests. This is the
   *  evidence-grounded fix for "don't punish the exploratory runner who is making progress." */
  passedProgress: boolean;
  /** The trailing failing runs (≥2) share an IDENTICAL failure signature (same failing-test set +
   *  normalized error) — the candidate is spinning on the same wall, so escalate sooner. A CHANGING
   *  error each run is NOT stagnant (still the normal ladder), so this only accelerates; it never
   *  suppresses the regular probe. */
  stagnant: boolean;
}

/** A run "passed" if it is correct. When the question has hidden tests, that means ALL tests green
 *  — a wrong-but-clean run counts as a FAILURE so the intervention engine + scorer see it. When
 *  there are no tests (legacy/no assigned problem), fall back to "ran clean" (Accepted, no error
 *  exit, no stderr) as the best available proxy for forward progress. */
export function runPassed(r: RunResult): boolean {
  if (r.testResults) {
    return r.testResults.total > 0 && r.testResults.passed === r.testResults.total;
  }
  const cleanExit = r.exitCode === 0 || r.exitCode === null;
  const noStderr = !(r.stderr && r.stderr.trim());
  return r.status === 'Accepted' && cleanExit && noStderr;
}

/** A synthetic idle-nudge marker (Path B) — appended to the code-run channel to record that the
 *  interviewer checked in on a stalled candidate, race-free. It is NOT a real execution: it must be
 *  excluded from every real-run signal (failure streak, progress, scoring), or it would inflate
 *  consecutiveFailures, be graded as a failed run, and its 'nudge' would consume the run-probe budget. */
export function isIdleRun(r: RunResult): boolean {
  return r.status === 'Idle';
}

/** Stable signature of a FAILING run, used to detect stagnation (same wall, run after run). Prefers
 *  the exact set of failing hidden-test indices; falls back to a normalized first line of the error
 *  output (line numbers / addresses / whitespace stripped so cosmetically-different-but-same errors
 *  still match). Two failing runs with the same signature ⇒ no forward movement. */
export function failureSignature(r: RunResult): string {
  if (r.testResults?.cases && r.testResults.cases.length > 0) {
    const failing = r.testResults.cases
      .filter((c) => !c.passed)
      .map((c) => c.index)
      .sort((a, b) => a - b)
      .join(',');
    return `tests:${failing}${r.testResults.incomplete ? '|inc' : ''}`;
  }
  const err = (r.stderr || r.compileOutput || '').trim();
  const firstLine = err.split('\n', 1)[0] ?? '';
  const norm = firstLine
    .toLowerCase()
    .replace(/0x[0-9a-f]+/g, '') // memory addresses
    .replace(/\d+/g, '') // line numbers / counts
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `err:${norm || r.status.toLowerCase()}`;
}

/** Derive the live struggle/progress signals for the current coding question from the run log. */
export function deriveRunSignals(runs: RunResult[], codeIndex: number): RunSignals {
  // Synthetic idle markers are not executions — drop them before any real-run reasoning.
  const real = runs.filter((r) => !isIdleRun(r));
  // Attribute runs to the current question when tagged. Only the first question (codeIndex 0)
  // falls back to the whole log for legacy rows that predate the codeIndex tag — a later question
  // with no tagged runs must NOT inherit an earlier question's failure streak.
  const tagged = real.filter((r) => r.codeIndex === codeIndex);
  const scoped = tagged.length > 0 ? tagged : codeIndex === 0 ? real : [];
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

  // Forward progress: the latest run beats the best passing-test count from earlier runs this
  // question. Deterministic and only meaningful with hidden tests; if the latest passed outright,
  // lastRunPassed already keeps us quiet, so this matters only while still failing.
  let passedProgress = false;
  if (last?.testResults && !runPassed(last)) {
    let priorBest = -1;
    for (let i = 0; i < scoped.length - 1; i++) {
      const tr = scoped[i].testResults;
      if (tr && tr.passed > priorBest) priorBest = tr.passed;
    }
    passedProgress = priorBest >= 0 && last.testResults.passed > priorBest;
  }

  // Stagnation: the two most recent FAILING runs share a signature (same failing tests / same
  // error). Compare the last two scoped runs only when both failed — cheap, deterministic, and a
  // faithful "hasn't moved" proxy. A changing error/test-set is deliberately NOT stagnant.
  let stagnant = false;
  if (consecutiveFailures >= 2 && scoped.length >= 2) {
    const a = scoped[scoped.length - 1];
    const b = scoped[scoped.length - 2];
    if (!runPassed(a) && !runPassed(b)) stagnant = failureSignature(a) === failureSignature(b);
  }

  return {
    runsThisQuestion: scoped.length,
    consecutiveFailures,
    lastStatus: last?.status ?? '',
    lastRunPassed: last ? runPassed(last) : false,
    hasErrorOutput,
    passedProgress,
    stagnant,
  };
}

/** How many idle-nudge markers (Path B) have already been delivered on the current coding question
 *  — derived from the run log (scoped by codeIndex), never stored, so it resets per question and
 *  can't race a concurrent run. */
export function idleNudgesGiven(runs: RunResult[], codeIndex: number): number {
  return runs.filter((r) => isIdleRun(r) && r.codeIndex === codeIndex).length;
}
