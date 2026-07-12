#!/usr/bin/env bash
# Disaster-recovery restore for Overforge (Supabase / PG15+).
#
# THIS IS THE DR PATH. Read every line before running against production.
# Rehearse against a staging database first — pg_restore --clean drops all
# existing objects before recreating them. Data in the target DB is REPLACED.
#
# Usage:
#   bash /home/ubuntu/overforge/deploy/restore.sh /var/backups/overforge/overforge-20260101-030000.dump
# Self-loads SUPABASE_DB_URL from backend.env — do NOT `source` that file (its values
# contain shell metacharacters and would break the shell).
#
# Environment variables:
#   SUPABASE_DB_URL — required; full libpq connection string from backend.env
#
# pg_restore client version note: same constraint as backup.sh — client major must be
# >= server major. This project is PG17; install postgresql-client-17 from the PGDG apt
# repo (Ubuntu 24.04 default repos stop at 16). See backup.sh header for the exact commands.
set -euo pipefail

# Robust env self-load (no `source` — backend.env holds shell metacharacters). Skipped
# when SUPABASE_DB_URL is already in the environment.
ENV_FILE="${BACKEND_ENV:-$(cd "$(dirname "$0")" && pwd)/backend.env}"
if [[ -z "${SUPABASE_DB_URL:-}" && -f "$ENV_FILE" ]]; then
  while IFS='=' read -r _k _v; do
    [[ "$_k" == "SUPABASE_DB_URL" ]] && export "$_k=$_v"
  done < <(grep -E '^SUPABASE_DB_URL=' "$ENV_FILE")
fi

ts()  { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
log() { printf '[%s] %s\n' "$(ts)" "$*"; }

# ── argument check ───────────────────────────────────────────────────────────
if [[ $# -lt 1 ]]; then
  log "Usage: $0 <path-to-dump-file>" >&2
  exit 1
fi
DUMPFILE="$1"

if [[ ! -f "$DUMPFILE" ]]; then
  log "ERROR: dump file not found: $DUMPFILE" >&2
  exit 1
fi

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  log "ERROR: SUPABASE_DB_URL is not set. Source deploy/backend.env first." >&2
  exit 1
fi

# Strip any query-string (?sslmode=...) from the URL for safe display.
DISPLAY_DB="${SUPABASE_DB_URL%%\?*}"

# ── loud confirmation ────────────────────────────────────────────────────────
cat >&2 <<'WARN'

  ╔══════════════════════════════════════════════════════════════════╗
  ║  DESTRUCTIVE RESTORE — READ BEFORE PROCEEDING                   ║
  ║                                                                  ║
  ║  pg_restore --clean will DROP every existing table/sequence/     ║
  ║  function and recreate them from the dump file. ALL DATA in the  ║
  ║  target database will be REPLACED by the dump's contents.        ║
  ║                                                                  ║
  ║  Rehearse this against a staging database before ever running    ║
  ║  it in production. This is the DR procedure; treat it as such.   ║
  ╚══════════════════════════════════════════════════════════════════╝

WARN

printf 'Dump file  : %s\n'   "$DUMPFILE"
printf 'Target DB  : %s\n\n' "$DISPLAY_DB"
printf 'Type "yes" to continue, anything else aborts: '
read -r CONFIRM

if [[ "$CONFIRM" != "yes" ]]; then
  log "Aborted by user — no changes made."
  exit 1
fi

# ── restore ──────────────────────────────────────────────────────────────────
log "Starting pg_restore from: $DUMPFILE"
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  -d "$SUPABASE_DB_URL" \
  "$DUMPFILE"

log "pg_restore complete."
log "Next steps:"
log "  1. Run a smoke-test query against the DB."
log "  2. Restart backend: docker compose -f deploy/docker-compose.yml restart backend"
log "  3. Hit /health and confirm the application is healthy before re-enabling candidate traffic."
