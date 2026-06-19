// Self-hosted Judge0 client (Service 2). Synchronous run-and-capture with base64
// I/O so candidate code/stdin can't corrupt the request. Verified against the
// live kernel when Judge0 is deployed on the VPS (see deploy/judge0/).

import { ExecutionKernel, RunRequest, RunResult } from './types';

export interface Judge0Config {
  baseUrl: string; // e.g. http://judge0:2358 (internal) or the VPS endpoint
  authToken?: string; // optional X-Auth-Token for the self-hosted instance
}

// Canonical language name -> Judge0 CE language_id. Curated to what we support.
export const LANGUAGE_IDS: Readonly<Record<string, number>> = {
  python: 71,
  javascript: 63,
  typescript: 74,
  java: 62,
  c: 50,
  cpp: 54,
  csharp: 51,
  go: 60,
  rust: 73,
  ruby: 72,
  php: 68,
  kotlin: 78,
  swift: 83,
  bash: 46,
};

export function languageId(language: string): number {
  const id = LANGUAGE_IDS[language.trim().toLowerCase()];
  if (id === undefined) {
    throw new Error(`Unsupported language: ${language}`);
  }
  return id;
}

const b64 = (s: string): string => Buffer.from(s ?? '', 'utf8').toString('base64');
const unb64 = (s: string | null | undefined): string =>
  s ? Buffer.from(s, 'base64').toString('utf8') : '';

export function createJudge0Kernel(config: Judge0Config): ExecutionKernel {
  return {
    async run(req: RunRequest): Promise<RunResult> {
      if (!config.baseUrl) {
        throw new Error('Judge0 is not configured: set JUDGE0_URL.');
      }
      const url = `${config.baseUrl.replace(/\/$/, '')}/submissions?base64_encoded=true&wait=true`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.authToken) headers['X-Auth-Token'] = config.authToken;

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          language_id: languageId(req.language),
          source_code: b64(req.source),
          stdin: b64(req.stdin ?? ''),
          cpu_time_limit: req.cpuTimeLimit ?? 5,
          memory_limit: req.memoryLimitKb ?? 128000,
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Judge0 HTTP ${res.status}: ${body.slice(0, 300)}`);
      }
      return normalize(await res.json());
    },
  };
}

interface Judge0Response {
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  status?: { id?: number; description?: string };
  exit_code?: number | null;
  time?: string | null; // seconds, as a string
  memory?: number | null; // KB
}

export function normalize(raw: unknown): RunResult {
  const r = (raw ?? {}) as Judge0Response;
  const timeSec = r.time != null ? Number(r.time) : NaN;
  return {
    stdout: unb64(r.stdout),
    stderr: unb64(r.stderr),
    compileOutput: unb64(r.compile_output),
    status: r.status?.description ?? 'Unknown',
    exitCode: r.exit_code ?? null,
    timeMs: Number.isFinite(timeSec) ? Math.round(timeSec * 1000) : null,
    memoryKb: r.memory ?? null,
  };
}
