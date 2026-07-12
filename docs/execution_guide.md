# Code Execution — How It Works

Finite runs candidate code in ephemeral, locked-down Docker containers.
There is no Judge0, no STUN/TURN server, and no third-party execution daemon.

## The `/run` request path

1. The frontend POSTs `{ language, source, stdin? }` to `POST /api/interviews/:id/run` on the
   Express backend.
2. `backend/src/http/interviews.ts` authenticates the candidate token and calls the execution
   kernel.
3. `backend/src/execution/docker.ts` (`DockerKernel`) launches one ephemeral container per
   run with the following constraints:

   | Flag | Value |
   |---|---|
   | `--network` | `none` (no outbound network) |
   | `--read-only` | yes — only `/work` (tmpfs) is writable |
   | `--cap-drop` | `ALL` |
   | `--memory` | `128m` |
   | `--pids-limit` | `64` |
   | `--user` | `nobody` (non-root) |
   | `--runtime` | `runsc` when `SANDBOX_RUNTIME=runsc` (gVisor) |

4. Source code and stdin are injected as base64-encoded environment variables (no shell
   interpolation). The container's entrypoint decodes and runs the file.
5. A wall-clock timeout kills the container if it does not exit in time.
6. `DockerKernel` reads stdout/stderr and returns `{ status, stdout, stderr, exitCode }` to
   the HTTP handler.
7. The backend runs hidden test cases via `runHiddenTests()` in
   `backend/src/interview/orchestrator.ts`: the hidden test stdin is fed to the same kernel
   and the pass/fail counts are stored server-side only (never sent to the candidate).

## Supported languages (7)

`python`, `javascript`, `typescript` (Deno), `java`, `cpp`, `go`, `ruby`

Each language maps to an official multi-arch image defined in `docker.ts` (`LANGS` map).

## gVisor (runsc) sandboxing

Set `SANDBOX_RUNTIME=runsc` in the backend environment. When set, every container runs
under [gVisor](https://gvisor.dev/), which intercepts syscalls in userspace (the candidate
code sees a `4.19.0-gvisor` kernel). This is the default in production.

## Runtime image pre-pull

The containers use official multi-arch images. Pre-pull them on the host after first deploy
so the first run of each language is fast (images are large; pulling on-demand would add
30–60 s to the first run):

```bash
bash deploy/pull-runtimes.sh
```

The script pulls all images listed in `docker.ts` (`LANGS` map). Re-run it whenever a new
language is added.

## Go build-cache volume

`go run` recompiles the standard library on every cold start (~10 s). A persistent Docker
volume (`of-go-cache` by default, overridable via `GO_CACHE_VOLUME`) is mounted at the path
pointed to by `GOCACHE` inside the container. Pre-warm it with:

```bash
bash deploy/warm-caches.sh
```

## Local requirements

- Docker daemon running and accessible (the backend needs the Docker socket).
- For gVisor: install the `runsc` runtime and register it with Docker.
- No other external services are required for code execution.
