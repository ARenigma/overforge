#!/usr/bin/env bash
# Lightweight uptime monitor for Overforge.
# Checks the backend /health endpoint and the Vercel frontend.
# On a non-2xx response: posts a JSON alert to ALERT_WEBHOOK (Slack/Discord
# incoming-webhook format) if set, otherwise logs to stdout only.
#
# Dependencies: curl (only). No jq or other tools needed.
#
# Usage (manual):
#   ALERT_WEBHOOK=https://hooks.slack.com/... bash deploy/uptime-check.sh
#
# Automated — see deploy/overforge-uptime.service + overforge-uptime.timer,
# or add to crontab as the fallback (every 2 min):
#   */2 * * * * ALERT_WEBHOOK=https://hooks.slack.com/... \
#     /home/ubuntu/overforge/deploy/uptime-check.sh \
#     >> /var/log/overforge-uptime.log 2>&1
#
# Environment variables:
#   BACKEND_URL   — backend base URL     (default: https://140.245.14.50.sslip.io)
#   FRONTEND_URL  — Vercel frontend URL  (default: https://overforge.vercel.app)
#   ALERT_WEBHOOK — Slack/Discord incoming-webhook URL; if unset, only logs
set -euo pipefail

BACKEND_URL="${BACKEND_URL:-https://140.245.14.50.sslip.io}"
FRONTEND_URL="${FRONTEND_URL:-https://overforge.vercel.app}"

ts()  { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
log() { printf '[%s] %s\n' "$(ts)" "$*"; }

alert() {
  local msg="$1"
  log "ALERT: $msg"
  if [[ -n "${ALERT_WEBHOOK:-}" ]]; then
    # Slack / Discord both accept {"text": "..."} payloads on incoming webhooks.
    curl -s -X POST "$ALERT_WEBHOOK" \
      -H 'Content-Type: application/json' \
      --data-raw "{\"text\": \"[Overforge uptime] $msg\"}" \
      --max-time 10 \
      >/dev/null
  fi
}

check() {
  local name="$1" url="$2"
  local http_code
  # curl exits non-zero on network error; the || echo "000" converts that to a
  # sentinel code so we can report it as an alert rather than aborting the script.
  http_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url" || echo "000")
  if [[ "$http_code" == 2* ]]; then
    log "OK   $name  HTTP $http_code  $url"
  else
    alert "$name returned HTTP $http_code — $url"
  fi
}

check "backend /health" "$BACKEND_URL/health"
check "frontend"        "$FRONTEND_URL"
