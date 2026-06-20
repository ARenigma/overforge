#!/usr/bin/env bash
# Provision the languages Overforge supports into the running Piston kernel.
# Run on the host after `docker compose up -d` (Piston is bound to 127.0.0.1:2000).
set -euo pipefail
PISTON="${PISTON_URL:-http://localhost:2000}"
LANGS=(python javascript typescript java c++ go rust ruby)

echo "Fetching available packages from $PISTON ..."
avail="$(curl -fsS "$PISTON/api/v2/packages")"

for lang in "${LANGS[@]}"; do
  ver="$(echo "$avail" | python3 -c "import sys,json;p=json.load(sys.stdin);v=sorted(x['language_version'] for x in p if x['language']=='$lang');print(v[-1] if v else '')")"
  if [ -z "$ver" ]; then echo "⚠️  $lang: no package available — skipping"; continue; fi
  echo "Installing $lang $ver ..."
  curl -fsS -X POST "$PISTON/api/v2/packages" -H 'Content-Type: application/json' \
    -d "{\"language\":\"$lang\",\"version\":\"$ver\"}" >/dev/null && echo "  ✓ $lang $ver"
done
echo "Done."
