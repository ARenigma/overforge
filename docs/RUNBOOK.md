# Overforge VPS Operator Runbook

**Stack:** 4-core ARM VPS (Oracle/beef, `140.245.14.50`), Docker Compose, Caddy TLS, Supabase Postgres.  
**Repo on VPS:** `/home/ubuntu/overforge` (adjust if cloned elsewhere).  
**All commands assume you are SSHed into the VPS as `ubuntu` unless noted.**

---

## Table of Contents

1. [Secrets and environment files](#1-secrets-and-environment-files)
2. [Deploy (first deploy and routine updates)](#2-deploy)
3. [Rollback](#3-rollback)
4. [Backup — run, verify, schedule](#4-backup)
5. [Restore (DR)](#5-restore-disaster-recovery)
6. [Install systemd timers](#6-install-systemd-timers)
7. [Disk pressure response](#7-disk-pressure-response)
8. [RTO / RPO statement](#8-rto--rpo-statement)
9. [On-call triage — interview broke at 2 am](#9-on-call-triage)

---

## 1. Secrets and Environment Files

| File | Lives on | Purpose |
|---|---|---|
| `deploy/backend.env` | VPS only — gitignored | All backend secrets: `SUPABASE_DB_URL`, `OPENAI_API_KEY`, `JWT_SECRET`, `DEV_EMAILS`, etc. |
| `deploy/voice.env` | VPS only — gitignored | STT secrets: `ASSEMBLYAI_API_KEY`, `STT_PROVIDER`, `STT_KEYTERMS`, etc. (optional — service boots without it) |

**Never commit either file.** Both are in `.gitignore`. To add a new secret, edit the file on the VPS directly and restart the affected service (`docker compose restart backend`).

To add `ALERT_WEBHOOK` for uptime alerting, append it to `backend.env`:

```bash
echo 'ALERT_WEBHOOK=https://hooks.slack.com/services/XXX/YYY/ZZZ' \
  >> /home/ubuntu/overforge/deploy/backend.env
```

---

## 2. Deploy

### Standard update (CI-built image from GitLab Container Registry)

CI tags images with the commit SHA and pushes to the registry. The intended rollout command is:

```bash
cd /home/ubuntu/overforge
BACKEND_IMAGE=registry.gitlab.com/arenigma1/overforge/backend:<sha> \
VOICE_IMAGE=registry.gitlab.com/arenigma1/overforge/voice:<sha> \
docker compose -f deploy/docker-compose.yml up -d backend voice
```

Caddy does not need a restart for API-only changes.

> **Note:** GitLab Container Registry image tagging is not yet wired to CI. Until it is, use the manual build path below.

### Manual build (first deploy or if CI registry is unavailable)

```bash
cd /home/ubuntu/overforge
git pull
docker compose -f deploy/docker-compose.yml build backend voice
docker compose -f deploy/docker-compose.yml up -d
```

### Post-deploy verification

```bash
# Services are up
docker compose -f deploy/docker-compose.yml ps

# Backend responds
curl -sf https://140.245.14.50.sslip.io/health && echo OK

# Voice is reachable internally (optional)
docker compose -f deploy/docker-compose.yml exec backend \
  curl -sf http://voice:5002/health && echo OK

# Tail logs briefly
docker compose -f deploy/docker-compose.yml logs --tail=50 backend
```

### First deploy only — pre-warm executor image cache

```bash
bash /home/ubuntu/overforge/deploy/pull-runtimes.sh
bash /home/ubuntu/overforge/deploy/warm-caches.sh
```

---

## 3. Rollback

### With GitLab Container Registry tags (intended workflow)

Identify the last known-good commit SHA from the GitLab pipeline, then:

```bash
cd /home/ubuntu/overforge
BACKEND_IMAGE=registry.gitlab.com/arenigma1/overforge/backend:<good-sha> \
docker compose -f deploy/docker-compose.yml up -d backend
```

Rollback for voice only:

```bash
VOICE_IMAGE=registry.gitlab.com/arenigma1/overforge/voice:<good-sha> \
docker compose -f deploy/docker-compose.yml up -d voice
```

Compose's `restart: unless-stopped` means the old container is stopped and replaced atomically; Caddy continues serving during the switchover (keep-alive connections drain).

### Manual rollback (no registry tags yet)

```bash
cd /home/ubuntu/overforge
git checkout <good-commit-sha>
docker compose -f deploy/docker-compose.yml build backend
docker compose -f deploy/docker-compose.yml up -d backend
git checkout main   # restore HEAD for future pulls
```

### Confirming the rollback

```bash
curl -sf https://140.245.14.50.sslip.io/health | jq .
docker compose -f deploy/docker-compose.yml ps
```

---

## 4. Backup

### How it works

`deploy/backup.sh` runs `pg_dump` in custom format (`-Fc`, already compressed) against `SUPABASE_DB_URL` and writes a timestamped file to `/var/backups/overforge/`. It rotates, keeping the newest `BACKUP_KEEP` dumps (default 14 = two weeks).

### Run a backup manually

```bash
cd /home/ubuntu/overforge
set -a; source deploy/backend.env; set +a
bash deploy/backup.sh
```

Expected output (last two lines):

```
[2026-01-01T03:30:05Z] pg_dump complete: 42M written.
[2026-01-01T03:30:06Z] Backup finished: /var/backups/overforge/overforge-20260101-033005.dump
```

### Verify the dump is readable

```bash
pg_restore --list /var/backups/overforge/overforge-<timestamp>.dump | head -20
```

This lists the table-of-contents without touching any live database. If it prints table names, the dump is intact.

### Check what's on disk

```bash
ls -lh /var/backups/overforge/
```

### Enable offsite copy (recommended)

1. Install rclone: `curl https://rclone.org/install.sh | sudo bash`
2. Configure an R2/S3/GCS remote: `rclone config`
3. Add to `deploy/backend.env`:
   ```
   BACKUP_R2_REMOTE=r2:overforge-backups
   ```
   Next backup run will `rclone copy` the new dump to the bucket.

---

## 5. Restore (Disaster Recovery)

**Always rehearse this against a staging database before a real DR event.**

```bash
cd /home/ubuntu/overforge
set -a; source deploy/backend.env; set +a
bash deploy/restore.sh /var/backups/overforge/overforge-<timestamp>.dump
```

The script will:
1. Print a large warning banner and the target DB host.
2. Prompt you to type `yes` to confirm.
3. Run `pg_restore --clean --if-exists --no-owner --no-privileges`.

After restore completes:

```bash
# Smoke-test: check row counts in a key table
psql "$SUPABASE_DB_URL" -c "SELECT COUNT(*) FROM interviews;"

# Restart backend to clear any in-memory state
docker compose -f deploy/docker-compose.yml restart backend

# Confirm health
curl -sf https://140.245.14.50.sslip.io/health | jq .
```

**RPO exposure:** restoring a 3 AM dump at 11 PM means up to ~20 h of interview records are lost. Weigh this against the failure scenario before proceeding.

---

## 6. Install Systemd Timers

Run these commands once on the VPS. They survive reboots; no cron needed.

### Backup timer (daily at 03:30 UTC)

```bash
sudo cp /home/ubuntu/overforge/deploy/overforge-backup.service /etc/systemd/system/
sudo cp /home/ubuntu/overforge/deploy/overforge-backup.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now overforge-backup.timer

# Verify
systemctl status overforge-backup.timer
systemctl list-timers overforge-backup.timer
```

To trigger a backup immediately (without waiting for 03:30):

```bash
sudo systemctl start overforge-backup.service
journalctl -u overforge-backup.service -f
```

### Uptime monitor timer (every 2 minutes)

First, make sure `ALERT_WEBHOOK` is in `deploy/backend.env` (see section 1).  
If you prefer to set it inline instead, uncomment the `Environment=ALERT_WEBHOOK=...` line in `deploy/overforge-uptime.service`.

```bash
sudo cp /home/ubuntu/overforge/deploy/overforge-uptime.service /etc/systemd/system/
sudo cp /home/ubuntu/overforge/deploy/overforge-uptime.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now overforge-uptime.timer

# Verify
systemctl status overforge-uptime.timer
journalctl -u overforge-uptime.service --since "5 minutes ago"
```

### Cron fallback (if systemd is unavailable)

```bash
# Backup — daily at 03:30 UTC
echo '30 3 * * * ubuntu set -a; source /home/ubuntu/overforge/deploy/backend.env; set +a; bash /home/ubuntu/overforge/deploy/backup.sh >> /var/log/overforge-backup.log 2>&1' \
  | sudo tee /etc/cron.d/overforge-backup

# Uptime — every 2 minutes
echo '*/2 * * * * ubuntu ALERT_WEBHOOK=<your-webhook> bash /home/ubuntu/overforge/deploy/uptime-check.sh >> /var/log/overforge-uptime.log 2>&1' \
  | sudo tee /etc/cron.d/overforge-uptime
```

---

## 7. Disk Pressure Response

The VPS disk was at **91% full** at the last audit. Docker image layers and build caches are the primary culprit. Respond in this order:

### Step 1 — safe prune (always safe, no service impact)

```bash
# Remove dangling images (unreferenced intermediate layers)
docker image prune -f

# Remove stale BuildKit cache
docker builder prune -f

# Check how much was freed
df -h /
```

### Step 2 — remove explicitly unused images

List all images, identify ones not referenced by a running service:

```bash
docker images
```

Remove by ID or tag:

```bash
docker rmi <image-id>
```

### What NOT to do

**NEVER run `docker system prune -a`.** This removes ALL images, including the executor runtime images (`python:3.12-slim`, `golang:1.22-alpine`, etc.) that the candidate executor pulls with `--pull never`. Destroying them means the first `/run` of each language will either fail (network-isolated containers) or pull at run-time (slow, breaks isolation).

If you must free space aggressively, use `docker image prune -a --filter "until=72h"` which targets images not used in the last 72 hours — but run `deploy/pull-runtimes.sh` immediately after to restore the executor runtime images.

### Step 3 — old backup dumps

If `/var/backups/overforge` is large, `BACKUP_KEEP=14` (two weeks) is the default. Reduce to 7 for short-term relief:

```bash
BACKUP_KEEP=7 bash /home/ubuntu/overforge/deploy/backup.sh
```

### Step 4 — system journal

```bash
sudo journalctl --disk-usage
sudo journalctl --vacuum-size=200M
```

---

## 8. RTO / RPO Statement

| Metric | Value | Notes |
|---|---|---|
| **RPO** | ~24 hours | Daily dump at 03:30 UTC. Maximum data loss = data written since last successful dump. Reduce to hours by adding offsite copy + more frequent dumps. |
| **RTO** | 30–90 minutes | Estimate: SSH access (5 min) + `pg_restore` for a ~100MB dump (5–15 min) + service restart + smoke test (10 min). Does not include time to provision a new VPS if the host is lost. |

**Single-host risk:** all services (Caddy, backend, voice) and all local backups run on one machine. A total host failure means both the application AND local backups are gone simultaneously. Mitigate with `BACKUP_R2_REMOTE` offsite copy. If the host is lost, provision a new VPS, clone the repo, restore from the offsite dump, and re-run `deploy/pull-runtimes.sh`.

---

## 9. On-Call Triage — Interview Broke at 2 AM

Work through these in order. Each step narrows the blast radius.

### 1. Check disk first (most common silent killer)

```bash
df -h /
```

If > 95%, do the safe prune from section 7 before anything else.

### 2. Are the containers running?

```bash
docker compose -f /home/ubuntu/overforge/deploy/docker-compose.yml ps
```

If a service shows `Exited` or `Restarting`:

```bash
docker compose -f /home/ubuntu/overforge/deploy/docker-compose.yml logs --tail=100 backend
docker compose -f /home/ubuntu/overforge/deploy/docker-compose.yml logs --tail=100 voice
```

Restart the affected service:

```bash
docker compose -f /home/ubuntu/overforge/deploy/docker-compose.yml restart backend
```

### 3. Hit /health directly

```bash
curl -v https://140.245.14.50.sslip.io/health
```

- `200 OK` with a JSON body — backend is alive. The issue may be Supabase, an LLM provider, or the frontend.
- `502 Bad Gateway` — Caddy is up but backend is not responding on port 5001. Check step 2.
- Connection refused / timeout — Caddy may be down. `docker compose restart caddy`.

### 4. Check if it's a resource-limit OOM event

```bash
# Did the kernel OOM-kill the backend process?
journalctl -k --since "1 hour ago" | grep -i 'oom\|killed process'

# Did the container hit mem_limit and get SIGKILL?
docker inspect overforge-backend-1 | grep -A5 OOMKilled
```

If OOMKilled is true, the service already restarted (`restart: unless-stopped`). Identify the memory leak via `docker stats` before the next spike.

### 5. Check Supabase

Visit the Supabase dashboard for the project. Confirm:
- Database is not paused (free-tier projects auto-pause after 7 days of inactivity)
- No active incidents at https://status.supabase.com

### 6. Check LLM provider

If interviews start but scoring or AI responses fail:
- Check MiniMax / Groq / Gemini status pages (provider in use is in `backend.env`).
- Check for 429 rate-limit errors in `docker logs overforge-backend-1 | grep 429`.

### 7. Candidate-facing issues (voice not connecting, code not running)

```bash
# Voice service
docker compose -f /home/ubuntu/overforge/deploy/docker-compose.yml logs --tail=50 voice

# Executor (Docker-per-run) — look for container spawn failures
docker logs overforge-backend-1 2>&1 | grep -i 'docker\|executor\|run\|spawn' | tail -30
```

Check the executor can still start a container:

```bash
docker run --rm --network none python:3.12-slim python -c "print('ok')"
```

If this fails with "image not found", the runtime images were pruned. Re-run:

```bash
bash /home/ubuntu/overforge/deploy/pull-runtimes.sh
```

### 8. Escalation

If none of the above resolves the issue in 15 minutes:
- Take a snapshot of `docker compose logs` for all services (save to a file).
- Note the exact error the candidate sees.
- Page Amit with the log snippet and the output of `docker compose ps` + `df -h`.
