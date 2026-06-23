#!/usr/bin/env bash
# Pre-warm persistent build caches the execution kernel mounts into run containers
# (backend/src/execution/docker.ts). Without this, Go recompiles the whole standard
# library on every /run (cold ~10s); with a warm GOCACHE it's ~0.3s.
#
# Idempotent: skips if already warmed. Run on the host after `docker compose up` and
# whenever the Go image changes (deploy/pull-runtimes.sh must have pulled it first).
set -euo pipefail

VOLUME="${GO_CACHE_VOLUME:-of-go-cache}"
GO_IMAGE="golang:1.22-alpine"
SANDBOX_UID="${SANDBOX_UID:-65534}" # 'nobody' — the uid run containers execute as

docker volume create "$VOLUME" >/dev/null

# Already warmed? (marker file written at the end of a successful warm.)
if docker run --rm -v "$VOLUME:/gocache" "$GO_IMAGE" test -f /gocache/.warmed 2>/dev/null; then
  echo "Go build cache already warm ($VOLUME)."
  exit 0
fi

echo "Warming Go build cache in volume '$VOLUME' (one-time, ~10s)…"

# Build a program that imports the stdlib packages interview answers commonly use, so those
# compiled packages land in the cache. Runs as root to populate the (root-owned) volume, then
# hands ownership to the sandbox uid so jailed non-root run containers can read + extend it.
docker run --rm -v "$VOLUME:/gocache" --user 0:0 -e SANDBOX_UID="$SANDBOX_UID" "$GO_IMAGE" sh -c '
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
  chown -R "${SANDBOX_UID}:${SANDBOX_UID}" /gocache
  touch /gocache/.warmed
'

echo "Go build cache warmed ($VOLUME)."
