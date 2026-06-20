#!/usr/bin/env bash
# Pre-pull the language images the execution kernel runs (backend/src/execution/docker.ts).
# Run once on the host after `docker compose up`, and again whenever a language is added.
# Pulling ahead of time keeps the first /run of each language fast and means runs need
# no registry access (the run containers themselves are --network none).
set -euo pipefail

IMAGES=(
  python:3.12-slim
  node:20-slim
  ruby:3.3-slim
  golang:1.22-alpine
  eclipse-temurin:21-jdk
  gcc:13
)

for img in "${IMAGES[@]}"; do
  echo "==> docker pull $img"
  docker pull "$img"
done

echo "All language runtimes pulled."
