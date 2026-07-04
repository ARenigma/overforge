# Code-Sandbox Hardening

How Overforge isolates candidate code (the `/run` path), what's shipped, and the prioritized
remaining work. The sandbox is the single most security-critical surface: it executes arbitrary,
potentially hostile code from anyone with an interview link.

Relevant files: `backend/src/execution/docker.ts` (the kernel), `deploy/docker-compose.yml`,
`deploy/backend.env` (host-only), `backend/src/http/interviews.ts` (`/run` + rate limits).

## Threat model

1. **Candidate code escapes the container** → reaches the host / other candidates' runs.
2. **Candidate code exfiltrates or attacks** → network egress, secret theft, resource exhaustion.
3. **The backend itself is popped** (RCE) → uses its Docker socket to own the host.
4. **Amplification** → one request fans out to many executions and starves other candidates.

## Baseline (shipped, verified on the VPS)

Every run is an ephemeral container, torn down after (dual timeout: 10s CPU `timeout -s KILL`,
15s wall + force-rm):

- `--network none` — no egress (verified: socket/HTTP/go-dial → "network unreachable").
- `--memory 256m --memory-swap 256m` (swap fully disabled), `--cpus 1`.
- `--read-only` root + `--tmpfs /work:exec,size=64m,uid=65534` (only writable path).
- `--user 65534:65534` (nobody), `--cap-drop ALL`, `--security-opt no-new-privileges`.
- `--pull never` (images pre-pulled by `deploy/pull-runtimes.sh`; no registry at run time).
- Source + stdin passed **base64 via env** (no shell injection); hidden-test stdin injected
  server-side and **never** returned to the candidate (`stripHiddenTests` on `/run` + `/state`).
- Global `EXEC_MAX_CONCURRENCY=4` semaphore over all in-flight runs.

## Shipped 2026-07-04 (this pass)

### (A) Defense-in-depth flags — `docker.ts`, zero VPS work

Verified against all 7 languages + the attack battery before shipping:

- `--ipc none` — no SysV shared-mem / semaphore side channels.
- `--ulimit core=0:0` (no core dumps), `nofile=256`, `nproc=64` (per-UID fork cap),
  `fsize=8388608` (8 MB single-file write; all compiled binaries < 5 MB).
- `--oom-score-adj 1000` — the sandbox is killed first on host OOM, never the backend/voice.
- `--pids-limit` lowered 128 → 64 (JVM G1GC peaks ~25-30 threads, GCC ~3 children).
- Java pinned to `-XX:+UseG1GC` (ZGC/Shenandoah need `userfaultfd`, unimplemented on ARM64 gVisor).

> `nproc` is a **per-UID** limit shared across all UID-65534 containers. At `EXEC_MAX_CONCURRENCY=4`
> that's ~16 procs/container — fine. If concurrency is raised, raise `nproc` proportionally.

### (B) gVisor (runsc) — kernel isolation, env-gated

`SANDBOX_RUNTIME=runsc` (set in `deploy/backend.env`) makes every run execute under gVisor's
user-space kernel (Sentry) — a ~20-syscall host surface instead of the full Linux ABI. Installed on
the beef VPS (arm64, **Systrap** platform — no `/dev/kvm`). **Live-verified in prod:** candidate
code reports `uname` = `4.19.0-gvisor` (not the host `6.17-oracle`).

- Code change is inert until the env is set; **rollback = unset `SANDBOX_RUNTIME` (→ runc) + restart,
  no redeploy.**
- Overhead measured on the VPS (whole `docker run`, cold): cpp 2.0→3.0s, java 1.2→2.1s,
  go 0.3→0.9s (warm Go cache still works under runsc) — all comfortably inside the 10s/15s timeouts.
- Compat pinned: Java G1GC (above); Deno's io_uring falls back on ENOSYS; `clone3`/`copy_file_range`
  fall back automatically.

Install (already done; recorded for rebuilds):

```bash
curl -fsSL https://gvisor.dev/archive.key | sudo gpg --dearmor -o /usr/share/keyrings/gvisor-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main" | sudo tee /etc/apt/sources.list.d/gvisor.list
sudo apt-get update && sudo apt-get install -y runsc
sudo runsc install && sudo systemctl reload docker   # reload is graceful; runtimes is live-reloadable
docker run --rm --runtime=runsc hello-world           # smoke
```

## Remaining plan (prioritized)

### 1. Backend RCE → host root — EVALUATED, socket-proxy REJECTED as the fix (2026-07-04)

The backend mounts `/var/run/docker.sock` (docker-out-of-docker). A backend RCE could
`docker run -v /:/host` (or `--privileged`, `--pid host`) and own the VPS. We evaluated the
Tecnativa docker-socket-proxy as the fix and **proved on the VPS it does NOT close this path.**

**Live evidence (isolated proxy, `CONTAINERS=1 POST=1 IMAGES=1`):** Tecnativa filters URL path +
HTTP method ONLY — it never inspects request bodies. Through the proxy:
- `POST /containers/create {HostConfig:{Binds:["/:/host"]}}` → **201** (a `-v /etc:/hostetc` run
  printed the host's hostname `beef-server`).
- `--privileged` and `--pid host` creates → **201**.
- It *does* block `exec`/`swarm`/`build`/`secrets`/`networks`/`volumes`/`system` (all 403) and does
  not break `/run` (`--runtime=runsc`, `-v of-go-cache`, `docker rm -f` all work).

So it's ~40% blast-radius reduction (kills the exec/build/swarm/plugin/secrets pivots) but is **not a
fix for create-with-bind** — shipping it as "socket hardening done" would be security theater.

**Decision (2026-07-04): SKIP.** gVisor (live) already contains the PRIMARY threat — candidate code.
The socket path requires *first* achieving RCE in the Node backend (secondary), and gVisor does not
help there. Rather than add prod infra churn for a partial measure, we accept the documented residual
and revisit with a REAL fix when warranted. Real fixes, strongest first:
1. **Rootless Docker** — a full escape lands unprivileged; host `/` never exposed. Prod daemon
   migration (downtime + revalidate all 7 langs + gVisor + of-go-cache UID remap). Recommended when done.
2. **`--userns-remap`** daemon-wide — bind-mounted host paths map to a non-root subuid (blunts, not full).
3. **~100-line body-filtering sidecar** — rejects create bodies with `Binds`/`Privileged`/`PidMode:host`/
   `NetworkMode:host`/`CapAdd`/`Devices`. Surgical, keeps rootful Docker, but bespoke security code to own.
   (Tecnativa can sit under any of these as a second layer, but adds nothing on its own.)

### 2. Custom seccomp profile — shrinks syscall surface (defense-in-depth atop gVisor)

`--security-opt seccomp=/etc/docker/sandbox-seccomp.json`, env-gated so it can be dropped without a
redeploy. Build it empirically: run each of the 7 images under `strace -c -f`, start from Docker's
default JSON, flip `defaultAction` to `SCMP_ACT_ERRNO`, keep only the observed set. Explicitly block
`ptrace, process_vm_{readv,writev}, kexec_*, bpf, perf_event_open, add_key, keyctl, request_key,
userfaultfd, io_uring_*, unshare(CLONE_NEWUSER)`. Per-lang: Node/Deno need `epoll_*`/`eventfd2`/
`timerfd_*` (Deno may want io_uring back — test); Go needs `clone`/`futex`/`madvise`.

> Lower marginal value now that gVisor's Sentry already mediates syscalls in user space — do it as
> belt-and-suspenders, not a priority.

### 3. Amplification guard — split semaphore + per-interview run budget

One `/run` fans out to ~12 hidden-test executions against the single global `EXEC_MAX_CONCURRENCY=4`
semaphore — a looped stolen token can starve all candidates. Add a **separate `hiddenTestSemaphore`**
(background pool) so hidden-test fan-out doesn't compete with foreground runs, plus a **per-interview
run budget** (reuse `enforceRateLimit` in `interviews.ts`, keyed by `interviewId`). Set the limit
from prod run-count telemetry, not a guess. Data-gated.

## Heavier options — only if the threat model changes

- **Rootless Docker** — strongest blast-radius cut; `--network none` makes the slirp4netns perf hit
  irrelevant. Needs a daemon migration + UID-mapping fix for `of-go-cache` in `warm-caches.sh`.
- **Kata Containers** (per-run microVM, own kernel; arm64 via Cloud Hypervisor) — adopt only if a
  gVisor-bypass CVE appears in the wild or we go multi-tenant across orgs (~200 MB RAM at
  concurrency 4).
- **Firecracker** — strongest, but no Docker integration (rewrites `docker.ts`); only when moving
  off the single VPS to a dedicated execution fleet.
