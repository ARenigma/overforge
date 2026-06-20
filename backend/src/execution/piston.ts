// Self-hosted Piston execution kernel (Service 2) — ARM64-native run-and-capture.
// Implements the same ExecutionKernel contract as before. Piston requires an
// explicit language+version, so we resolve installed versions from /runtimes once
// and cache them. Languages are provisioned on the host at deploy time.

import { ExecutionKernel, RunRequest, RunResult } from './types';

export interface PistonConfig {
  baseUrl: string; // e.g. http://piston:2000
}

// Canonical languages the editor offers / the kernel supports. The host must have
// these provisioned in Piston at deploy time.
export const SUPPORTED_LANGUAGES = [
  'python',
  'javascript',
  'typescript',
  'java',
  'cpp',
  'go',
  'rust',
  'ruby',
] as const;

// Canonical language name -> Piston language name (only the ones that differ).
const NAME_MAP: Readonly<Record<string, string>> = {
  cpp: 'c++',
  csharp: 'csharp.net',
};

function pistonLanguage(language: string): string {
  const l = language.trim().toLowerCase();
  return NAME_MAP[l] ?? l;
}

interface Runtime {
  language: string;
  version: string;
  aliases?: string[];
}

interface PistonExecuteResponse {
  run?: { stdout?: string; stderr?: string; output?: string; code?: number | null; signal?: string | null };
  compile?: { stdout?: string; stderr?: string; output?: string; code?: number | null };
}

export function createPistonKernel(config: PistonConfig): ExecutionKernel {
  let runtimesCache: Map<string, string> | null = null; // language/alias -> version

  async function resolveVersion(language: string): Promise<string> {
    if (!runtimesCache) {
      const res = await fetch(`${config.baseUrl.replace(/\/$/, '')}/api/v2/runtimes`);
      if (!res.ok) throw new Error(`Piston /runtimes HTTP ${res.status}`);
      const runtimes = (await res.json()) as Runtime[];
      const map = new Map<string, string>();
      for (const rt of runtimes) {
        // Last one wins → latest listed version for a language.
        map.set(rt.language, rt.version);
        for (const a of rt.aliases ?? []) map.set(a, rt.version);
      }
      runtimesCache = map;
    }
    const version = runtimesCache.get(language);
    if (!version) {
      throw new Error(`Language not installed on the execution engine: ${language}`);
    }
    return version;
  }

  return {
    async run(req: RunRequest): Promise<RunResult> {
      if (!config.baseUrl) {
        throw new Error('Piston is not configured: set PISTON_URL.');
      }
      const language = pistonLanguage(req.language);
      const version = await resolveVersion(language);

      const res = await fetch(`${config.baseUrl.replace(/\/$/, '')}/api/v2/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language,
          version,
          files: [{ content: req.source }],
          stdin: req.stdin ?? '',
          run_timeout: (req.cpuTimeLimit ?? 5) * 1000, // ms
          run_memory_limit: (req.memoryLimitKb ?? 128000) * 1024, // bytes (-1 = unlimited)
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Piston HTTP ${res.status}: ${body.slice(0, 300)}`);
      }
      return normalize(await res.json());
    },
  };
}

export function normalize(raw: unknown): RunResult {
  const r = (raw ?? {}) as PistonExecuteResponse;
  const compileFailed = r.compile != null && (r.compile.code ?? 0) !== 0;
  const run = r.run ?? {};
  let status: string;
  if (compileFailed) status = 'Compilation Error';
  else if (run.signal) status = `Runtime Error (${run.signal})`;
  else if ((run.code ?? 0) === 0) status = 'Accepted';
  else status = 'Runtime Error';

  return {
    stdout: run.stdout ?? '',
    stderr: run.stderr ?? '',
    compileOutput: r.compile?.stderr || r.compile?.output || '',
    status,
    exitCode: run.code ?? null,
    timeMs: null, // Piston does not report wall time by default
    memoryKb: null,
  };
}
