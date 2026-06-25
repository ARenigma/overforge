// Contract for the sandboxed code-execution kernel (Docker-per-run, ARM-native).
// The backend calls run-and-capture; no live web preview in M1.

// The kernel itself never sets `intervention` — the orchestrator attaches it (USP). The type is
// imported only to keep the union strong end-to-end.
import { InterventionKind } from '../interview/types';

export interface RunRequest {
  language: string; // canonical name, e.g. 'python', 'javascript', 'java'
  source: string;
  stdin?: string;
  /** CPU time limit (seconds). */
  cpuTimeLimit?: number;
  /** Memory limit (KB). */
  memoryLimitKb?: number;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  compileOutput: string;
  /** Execution status, e.g. 'Accepted', 'Runtime Error', 'Compilation Error'. */
  status: string;
  exitCode: number | null;
  timeMs: number | null;
  memoryKb: number | null;
  /** Canonical language of the run, recorded so the scorer can judge code quality. */
  language?: string;
  /** Which coding question (fsm_state.codeIndex) this run belongs to — set by the orchestrator,
   *  not the kernel, so the intervention engine can scope its signals to the current question. */
  codeIndex?: number;
  /** An autonomous interviewer hint surfaced for this run (USP) — set by the orchestrator so the
   *  room can show it immediately. Persisted on the run (race-free) and read by the scorer. */
  intervention?: { text: string; kind: InterventionKind };
}

export interface ExecutionKernel {
  run(req: RunRequest): Promise<RunResult>;
}
