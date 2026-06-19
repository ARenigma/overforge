# Judge0 — Service 2 (Execution Kernel)

Self-hosted run-and-capture sandbox on the Oracle VPS. The Core API (Service 1)
calls it via `backend/src/execution/judge0.ts`; it is **not** exposed publicly.

## Prerequisites (VPS)
- Docker + Docker Compose.
- Judge0's sandbox (`isolate`) needs cgroup access and privileged containers. On
  modern hosts you may need cgroup v1 for Judge0 1.13.x:
  add `systemd.unified_cgroup_hierarchy=0` to the kernel cmdline and reboot.
- KVM is **not** required (isolate uses cgroups/namespaces, not VMs).

## Configure
1. `cp judge0.conf.example judge0.conf` and set strong values for
   `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, and `AUTHN_TOKEN` (the latter becomes the
   backend's `JUDGE0_AUTH_TOKEN`).
2. Export `REDIS_PASSWORD` for compose interpolation (or use an `.env` next to the
   compose file): `echo "REDIS_PASSWORD=<same-as-conf>" > .env`.

## Run
```bash
docker compose up -d
curl -s http://127.0.0.1:2358/about   # sanity check
```

## Backend wiring
Set on the Core API service: `JUDGE0_URL=http://judge0-server:2358` (internal) and
`JUDGE0_AUTH_TOKEN=<AUTHN_TOKEN>`. `createJudge0Kernel({ baseUrl, authToken })` then
runs submissions synchronously (`wait=true`, base64 I/O).

## Notes
- Workers scale via the `judge0-workers` service (run multiple replicas for warm
  throughput). Tune `MAX_CPU_TIME_LIMIT` / memory in `judge0.conf`.
- This replaces the old RapidAPI-hosted `judge0Service.js`; once this is live the
  Core API's run endpoint switches to the self-hosted kernel.
