#!/usr/bin/env bash
# Nightly Postgres backup for Overforge (Supabase / PG15+).
#
# Usage (manual / cron):
#   set -a; source /home/ubuntu/overforge/deploy/backend.env; set +a
#   bash /home/ubuntu/overforge/deploy/backup.sh
#
# When driven by the systemd timer (deploy/overforge-backup.service), the
# EnvironmentFile= directive sources backend.env automatically — no manual sourcing needed.
#
# Environment variables (from backend.env or the calling shell):
#   SUPABASE_DB_URL  — required; full libpq connection string to the Supabase Postgres instance
#   BACKUP_DIR       — directory for dump files (default: /var/backups/overforge)
#   BACKUP_KEEP      — number of newest dumps to retain before rotating (default: 14)
#   BACKUP_R2_REMOTE — optional rclone remote:path for offsite copy (e.g. r2:overforge-backups)
#
# pg_dump client version note:
#   The client's MAJOR version must be >= the server's MAJOR version, or pg_dump will
#   refuse with a "server version mismatch" error. Supabase runs PG15+.
#   Install the right client on the VPS:
#     Ubuntu/Debian : apt-get install -y postgresql-client-15
#     Amazon Linux 2: amazon-linux-extras install postgresql15
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/overforge}"
BACKUP_KEEP="${BACKUP_KEEP:-14}"

ts()  { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
log() { printf '[%s] %s\n' "$(ts)" "$*"; }

# ── validate environment ─────────────────────────────────────────────────────
if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  log "ERROR: SUPABASE_DB_URL is not set. Source deploy/backend.env first, or check the systemd EnvironmentFile." >&2
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
