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

export const SUPPORTED_LANGUAGES = ['python', 'javascript', 'java', 'cpp', 'go', 'ruby'] as const;

interface LangSpec {
  image: string;
  file: string;
  // shell run inside the container; compiles if needed then runs $file, reading the program's stdin.
  cmd: string;
}

// Official multi-arch (arm64-native) images + per-language run line.
const LANGS: Readonly<Record<string, LangSpec>> = {
  python: { image: 'python:3.12-slim', file: 'main.py', cmd: 'python3 main.py' },
  javascript: { image: 'node:20-slim', file: 'main.js', cmd: 'node main.js' },
  ruby: { image: 'ruby:3.3-slim', file: 'main.rb', cmd: 'ruby main.rb' },
  go: { image: 'golang:1.22-alpine', file: 'main.go', cmd: 'go run main.go' },
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
