// Contract for the sandboxed code-execution kernel (Service 2 = self-hosted Piston).
// The backend calls run-and-capture; no live web preview in M1.

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
}

export interface ExecutionKernel {
  run(req: RunRequest): Promise<RunResult>;
}
