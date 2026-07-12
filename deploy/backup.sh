#!/usr/bin/env bash
# Nightly Postgres backup for Overforge (Supabase / PG15+).
#
# Usage (manual / cron):
#   bash /home/ubuntu/overforge/deploy/backup.sh
# The script self-loads the keys it needs from backend.env — do NOT `source` that file
# (its values contain shell metacharacters, e.g. CORS_PREVIEW_REGEX, and would break the shell).
#
# When driven by the systemd timer (deploy/overforge-backup.service), the
# EnvironmentFile= directive populates the environment directly — the self-load is skipped.
#
# Environment variables (from backend.env or the calling shell):
#   SUPABASE_DB_URL  — required; full libpq connection string to the Supabase Postgres instance
#   BACKUP_DIR       — directory for dump files (default: /var/backups/overforge)
#   BACKUP_KEEP      — number of newest dumps to retain before rotating (default: 14)
#   BACKUP_R2_REMOTE — optional rclone remote:path for offsite copy (e.g. r2:overforge-backups)
#
# pg_dump client version note:
#   The client's MAJOR version must be >= the server's MAJOR version, or pg_dump refuses
#   with "server version mismatch". This Supabase project is PG17 — and Ubuntu 24.04's
#   default repos only ship postgresql-client-16, so install 17 from the PostgreSQL apt repo:
#     curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/pgdg.gpg
#     echo "deb https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release; echo $VERSION_CODENAME)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list
#     sudo apt-get update && sudo apt-get install -y postgresql-client-17
#   (pg_wrapper then selects 17 for the bare `pg_dump`/`pg_restore` commands.)
set -euo pipefail

# ── robust env self-load (no `source`) ───────────────────────────────────────
# backend.env holds values with shell metacharacters (CORS_PREVIEW_REGEX has ()/$),
# so `source`-ing it fails. Read ONLY the keys we need, without eval, splitting on the
# FIRST '=' so values containing '=' survive. Skipped entirely when the environment is
# already populated (systemd EnvironmentFile, or an explicit export).
ENV_FILE="${BACKEND_ENV:-$(cd "$(dirname "$0")" && pwd)/backend.env}"
if [[ -z "${SUPABASE_DB_URL:-}" && -f "$ENV_FILE" ]]; then
  while IFS='=' read -r _k _v; do
    [[ -n "$_k" ]] && export "$_k=$_v"
  done < <(grep -E '^(SUPABASE_DB_URL|BACKUP_DIR|BACKUP_KEEP|BACKUP_R2_REMOTE)=' "$ENV_FILE")
fi

BACKUP_DIR="${BACKUP_DIR:-/var/backups/overforge}"
BACKUP_KEEP="${BACKUP_KEEP:-14}"

ts()  { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
log() { printf '[%s] %s\n' "$(ts)" "$*"; }

# ── validate environment ─────────────────────────────────────────────────────
if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  log "ERROR: SUPABASE_DB_URL is empty/unset." >&2
  log "  This is the DIRECT Postgres connection URI (with the DB password), NOT SUPABASE_URL." >&2
  log "  Get it from the Supabase dashboard: Project Settings → Database → Connection string → URI" >&2
  log "  (use the 'Session'/direct connection or the pooler URI), then set it in deploy/backend.env:" >&2
  log "    SUPABASE_DB_URL=postgresql://postgres:<db-password>@db.<ref>.supabase.co:5432/postgres" >&2
  exit 1
fi

# ── ensure backup directory exists ──────────────────────────────────────────
mkdir -p "$BACKUP_DIR"
log "Backup directory: $BACKUP_DIR"

# ── dump ─────────────────────────────────────────────────────────────────────
# -Fc (custom format) uses zlib compression internally; no post-dump gzip needed.
# --no-owner / --no-privileges: dump is portable across Supabase project restores.
FILENAME="overforge-$(date -u '+%Y%m%d-%H%M%S').dump"
DEST="$BACKUP_DIR/$FILENAME"

log "Starting pg_dump → $DEST"
pg_dump "$SUPABASE_DB_URL" \
  --no-owner \
  --no-privileges \
  -Fc \
  -f "$DEST"

log "pg_dump complete: $(du -sh "$DEST" | cut -f1) written."

# ── rotate: keep newest BACKUP_KEEP dumps ───────────────────────────────────
# Filenames are timestamped (overforge-YYYYMMDD-HHMMSS.dump), so lexicographic
# reverse sort equals newest-first.
log "Rotating: keeping newest $BACKUP_KEEP dumps in $BACKUP_DIR"
find "$BACKUP_DIR" -maxdepth 1 -name 'overforge-*.dump' -type f \
  | sort --reverse \
  | tail -n "+$((BACKUP_KEEP + 1))" \
  | xargs -r rm -v --

# ── optional offsite copy via rclone ────────────────────────────────────────
if [[ -n "${BACKUP_R2_REMOTE:-}" ]]; then
  if command -v rclone &>/dev/null; then
    log "Copying $FILENAME to offsite: $BACKUP_R2_REMOTE"
    rclone copy "$DEST" "$BACKUP_R2_REMOTE"
    log "Offsite copy complete."
  else
    log "WARNING: BACKUP_R2_REMOTE is set but 'rclone' is not installed — skipping offsite copy."
    log "         Install: https://rclone.org/install/ then configure: rclone config"
  fi
else
  log "NOTICE: BACKUP_R2_REMOTE is not set."
  log "        Dumps are LOCAL-ONLY on this host (/var/backups/overforge)."
  log "        If this host fails, all local dumps are lost."
  log "        Recommended: set BACKUP_R2_REMOTE=<remote>:<bucket> in backend.env"
  log "        and install rclone to enable offsite copy (Cloudflare R2, S3, GCS, etc.)."
fi

log "Backup finished: $DEST"
