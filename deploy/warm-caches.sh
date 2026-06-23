#!/usr/bin/env bash
# Pre-warm persistent build caches the execution kernel mounts into run containers
# (backend/src/execution/docker.ts). Without this, Go recompiles the whole standard
# library on every /run (cold ~10s); with a warm GOCACHE it's ~0.3s.
#
# Idempotent + version-aware: the volume records the exact `go version` it was warmed for.
# A re-run after a Go image bump (tag OR patch) sees the mismatch and re-warms; otherwise it
# skips. Run on the host after `docker compose up` (pull-runtimes.sh must have pulled the image).
set -euo pipefail

VOLUME="${GO_CACHE_VOLUME:-of-go-cache}"
GO_IMAGE="golang:1.22-alpine"
SANDBOX_UID="${SANDBOX_UID:-65534}" # 'nobody' — the uid run containers execute as

docker volume create "$VOLUME" >/dev/null

# One container: report the image's current `go version` AND the version this volume was last
# warmed for (the marker holds that exact string). Compare to decide warm-vs-skip.
probe="$(docker run --rm -v "$VOLUME:/gocache" "$GO_IMAGE" \
  sh -c 'echo "VER:$(go version)"; echo "MARK:$(cat /gocache/.warmed 2>/dev/null)"')"
cur_ver="$(printf '%s\n' "$probe" | sed -n 's/^VER://p')"
marker_ver="$(printf '%s\n' "$probe" | sed -n 's/^MARK://p')"

if [ -n "$cur_ver" ] && [ "$cur_ver" = "$marker_ver" ]; then
  echo "Go build cache already warm for: $cur_ver ($VOLUME)."
  exit 0
fi

if [ -z "$cur_ver" ]; then
  echo "Could not determine go version from $GO_IMAGE; aborting warm." >&2
  exit 1
fi
echo "Warming Go build cache in '$VOLUME' for: $cur_ver (one-time, ~10s)…"

# Build a program that imports the stdlib packages interview answers commonly use, so those
# compiled packages land in the cache. Runs as root to populate the (root-owned) volume, then
# stamps the version marker and hands the whole tree to the sandbox uid so jailed non-root run
# containers can read + extend it.
docker run --rm -v "$VOLUME:/gocache" --user 0:0 \
  -e SANDBOX_UID="$SANDBOX_UID" -e CUR_VER="$cur_ver" "$GO_IMAGE" sh -c '
  set -e
  mkdir -p /tmp/warm && cd /tmp/warm
  cat > main.go <<'"'"'EOF'"'"'
package main

import (
	"bufio"
	"bytes"
	"container/heap"
	"container/list"
	"errors"
	"fmt"
	"math"
	"math/bits"
	"os"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

func main() {
	_ = bufio.NewReader(os.Stdin)
	_ = bytes.NewBufferString("")
	_ = errors.New("x")
	_ = math.Sqrt(2)
	_ = bits.OnesCount(1)
	xs := []int{3, 1, 2}
	sort.Ints(xs)
	slices.Sort(xs)
	_ = strconv.Itoa(1)
	_ = strings.Split("a,b", ",")
	_ = time.Now()
	_ = list.New()
	_ = regexp.MustCompile(".")
	_ = heap.Init
	var mu sync.Mutex
	mu.Lock()
	mu.Unlock()
	fmt.Println("warm", xs)
}
EOF
  export GOCACHE=/gocache GOPATH=/tmp/warm/go GOTMPDIR=/tmp HOME=/tmp
  go build -o /tmp/warm/app main.go
  printf "%s" "$CUR_VER" > /gocache/.warmed
  chown -R "${SANDBOX_UID}:${SANDBOX_UID}" /gocache
'

echo "Go build cache warmed for $cur_ver ($VOLUME)."
