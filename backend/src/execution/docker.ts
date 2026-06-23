// Self-hosted code execution kernel — ARM64-native, no third-party daemon.
// Each run spins an ephemeral, locked-down container from an official multi-arch
// language image: no network, capped memory/cpu/pids, read-only, non-root, killed
// on a wall-clock timeout. Source + stdin are passed base64-encoded via env (no
// shell injection). Requires Docker socket access (the backend is trusted; the
// candidate's code runs in the sandbox container, never with socket access).

import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import { ExecutionKernel, RunRequest, RunResult } from './types';
import { Semaphore } from './semaphore';

// Global cap on simultaneous sandbox containers across all in-flight /run calls, so a
// burst (or a stolen token in a loop) cannot exhaust the host. Tune via env.
const EXEC_MAX_CONCURRENCY = Number(process.env.EXEC_MAX_CONCURRENCY ?? 4);
const execSemaphore = new Semaphore(EXEC_MAX_CONCURRENCY);

export const SUPPORTED_LANGUAGES = [
  'python',
  'javascript',
  'typescript',
  'java',
  'cpp',
  'go',
  'ruby',
] as const;

interface LangSpec {
  image: string;
  file: string;
  // shell run inside the container; compiles if needed then runs $file, reading the program's stdin.
  cmd: string;
  // Extra env beyond COMMON_ENV (e.g. Go's cache/module dirs that otherwise default to the
  // read-only root FS). Merged on top of COMMON_ENV.
  env?: Readonly<Record<string, string>>;
  // Persistent, pre-warmed build cache mounted into every run (e.g. Go's GOCACHE). Shared
  // across runs so the toolchain doesn't recompile from cold each time. The volume is warmed
  // + chowned to the sandbox uid by deploy/warm-caches.sh; it holds only content-addressed
  // cache entries (no run can hand-pick another's, and the build dir stays the per-run tmpfs).
  cacheVolume?: { name: string; path: string };
}

// Name of the persistent Go build-cache volume (see deploy/warm-caches.sh). Overridable so a
// host can point at its own volume.
const GO_CACHE_VOLUME = process.env.GO_CACHE_VOLUME ?? 'of-go-cache';

// The container is --read-only with ONLY /work (a tmpfs) writable. Point HOME and the temp
// dir at /work so toolchains that need scratch space — and programs that open temp files —
// don't hit the read-only root. Applied to every language.
const COMMON_ENV: Readonly<Record<string, string>> = {
  HOME: '/work',
  TMPDIR: '/work',
};

// Official multi-arch (arm64-native) images + per-language run line.
const LANGS: Readonly<Record<string, LangSpec>> = {
  python: { image: 'python:3.12-slim', file: 'main.py', cmd: 'python3 main.py' },
  javascript: { image: 'node:20-slim', file: 'main.js', cmd: 'node main.js' },
  // Deno runs TypeScript natively (no separate transpile/install step). --no-prompt makes a
  // permission request fail instead of hanging; DENO_DIR points at the writable tmpfs since
  // the image's default cache dir is on the read-only root.
  typescript: {
    image: 'denoland/deno:alpine-2.8.3',
    file: 'main.ts',
    cmd: 'deno run --no-prompt main.ts',
    env: { DENO_DIR: '/work/.deno' },
  },
  ruby: { image: 'ruby:3.3-slim', file: 'main.rb', cmd: 'ruby main.rb' },
  go: {
    image: 'golang:1.22-alpine',
    file: 'main.go',
    cmd: 'go run main.go',
    // `go run` needs writable cache/module/work dirs; their defaults ($HOME/.cache, the
    // image's GOPATH=/go, and $TMPDIR for the build work dir) all land on the read-only
    // root FS. GOCACHE points at the persistent pre-warmed volume so the stdlib isn't
    // recompiled every run (cold ~10s → warm ~0.3s); GOPATH/GOTMPDIR stay in the per-run
    // /work tmpfs.
    env: {
      GOCACHE: '/gocache',
      GOPATH: '/work/go',
      GOTMPDIR: '/work',
    },
    cacheVolume: { name: GO_CACHE_VOLUME, path: '/gocache' },
  },
  java: { image: 'eclipse-temurin:21-jdk', file: 'Main.java', cmd: 'javac Main.java && java Main' },
  cpp: { image: 'gcc:13', file: 'main.cpp', cmd: 'g++ -O2 -o app main.cpp && ./app' },
};

export interface DockerKernelConfig {
  cpus?: string; // --cpus
  memory?: string; // --memory
  pidsLimit?: number;
  wallTimeoutMs?: number; // host-side hard kill
  cpuTimeoutSec?: number; // in-container `timeout`
}

const b64 = (s: string): string => Buffer.from(s ?? '', 'utf8').toString('base64');

export function createDockerKernel(config: DockerKernelConfig = {}): ExecutionKernel {
  const cpus = config.cpus ?? '1';
  const memory = config.memory ?? '256m';
  const pids = config.pidsLimit ?? 128;
  const wallMs = config.wallTimeoutMs ?? 15_000;

  return {
    run(req: RunRequest): Promise<RunResult> {
      const spec = LANGS[req.language.trim().toLowerCase()];
      if (!spec) return Promise.reject(new Error(`Unsupported language: ${req.language}`));

      if (!execSemaphore.tryAcquire()) {
        return Promise.reject(
          Object.assign(new Error('Server is busy running code; please retry in a moment.'), {
            status: 429,
          })
        );
      }

      const cpuSec = req.cpuTimeLimit ?? config.cpuTimeoutSec ?? 10;
      const containerName = `of-run-${randomUUID()}`;

      // Redirect HOME/TMPDIR (+ per-language scratch like Go's caches) into the writable
      // /work tmpfs, since the rest of the FS is read-only.
      const envArgs = Object.entries({ ...COMMON_ENV, ...(spec.env ?? {}) }).flatMap(([k, v]) => [
        '-e',
        `${k}=${v}`,
      ]);

      // Mount the persistent, pre-warmed build cache (Go's GOCACHE) so compilation reuses
      // the warm stdlib instead of recompiling cold on every run.
      const cacheArgs = spec.cacheVolume
        ? ['-v', `${spec.cacheVolume.name}:${spec.cacheVolume.path}`]
        : [];

      // In-container: decode source + stdin from env, then (compile &&) run under `timeout`,
      // piping the decoded stdin to the program. Single-quoted heredoc-free, all data is base64.
      const inner =
        `printf %s "$B64SRC" | base64 -d > ${spec.file}; ` +
        `printf %s "$B64IN" | base64 -d > .stdin; ` +
        `timeout -s KILL ${cpuSec} sh -c '${spec.cmd}' < .stdin`;

      const args = [
        'run',
        '--rm',
        '-i',
        '--name',
        containerName,
        // Images are pre-pulled (deploy/pull-runtimes.sh); never hit a registry at run time.
        '--pull',
        'never',
        '--network',
        'none',
        '--memory',
        memory,
        '--memory-swap',
        memory,
        '--cpus',
        cpus,
        '--pids-limit',
        String(pids),
        '--read-only',
        '--tmpfs',
        '/work:exec,size=64m,uid=65534',
        '--workdir',
        '/work',
        '--user',
        '65534:65534',
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges',
        ...cacheArgs,
        ...envArgs,
        '-e',
        `B64SRC=${b64(req.source)}`,
        '-e',
        `B64IN=${b64(req.stdin ?? '')}`,
        spec.image,
        'sh',
        '-c',
        inner,
      ];

      return new Promise<RunResult>((resolve) => {
        const started = Date.now();
        execFile(
          'docker',
          args,
          { timeout: wallMs, maxBuffer: 2 * 1024 * 1024, killSignal: 'SIGKILL' },
          (err, stdout, stderr) => {
            execSemaphore.release();
            const timeMs = Date.now() - started;
            const e = err as
              | (NodeJS.ErrnoException & { killed?: boolean; code?: number | string })
              | null;
            let status: string;
            let exitCode: number | null;
            if (e && e.killed) {
              status = 'Time Limit Exceeded';
              exitCode = null;
              // The wall-clock kill stops the docker client, not necessarily the
              // container — best-effort force-remove so it can't linger on the host.
              execFile('docker', ['rm', '-f', containerName], {}, () => undefined);
            } else if (e && typeof e.code === 'number' && e.code !== 0) {
              // 124 = in-container timeout; 137 = OOM/kill; else runtime error
              status = e.code === 124 || e.code === 137 ? 'Time Limit Exceeded' : 'Runtime Error';
              exitCode = e.code;
            } else if (e) {
              status = 'Runtime Error';
              exitCode = null;
            } else {
              status = 'Accepted';
              exitCode = 0;
            }
            resolve({
              stdout: stdout ?? '',
              stderr: stderr ?? '',
              compileOutput: '',
              status,
              exitCode,
              timeMs,
              memoryKb: null,
            });
          }
        );
      });
    },
  };
}
