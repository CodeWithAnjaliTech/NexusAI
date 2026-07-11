#!/usr/bin/env bash
# Shared Docker helpers — the CLI can hang on Mac even when Desktop shows "Engine running".

docker_with_timeout() {
  local seconds=$1
  shift

  if command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$seconds" "$@"
    return $?
  fi
  if command -v timeout >/dev/null 2>&1; then
    timeout "$seconds" "$@"
    return $?
  fi

  "$@" &
  local pid=$!
  local elapsed=0
  while kill -0 "$pid" 2>/dev/null && (( elapsed < seconds )); do
    sleep 1
    elapsed=$((elapsed + 1))
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM "$pid" 2>/dev/null || true
    sleep 1
    kill -KILL "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
    return 124
  fi
  wait "$pid"
  return $?
}

require_docker() {
  local wait_seconds=${1:-10}
  echo "==> Checking Docker (timeout ${wait_seconds}s)..."

  if docker_with_timeout "$wait_seconds" docker info >/dev/null 2>&1; then
    echo "✓ Docker Engine is responding"
    return 0
  fi

  echo ""
  echo "ERROR: Docker CLI is not responding."
  echo "Docker Desktop may show 'Engine running' but the command-line still hangs — this is a known Mac issue."
  echo ""
  echo "Fix (try in order):"
  echo "  1. Quit Docker Desktop fully (Cmd+Q), wait 10s, open it again"
  echo "  2. Wait until bottom-left says 'Engine running' (can take 1–2 min)"
  echo "  3. Run:  docker context use desktop-linux"
  echo "  4. Test:  docker version   (must finish in a few seconds, not hang)"
  echo "  5. Docker Desktop → Troubleshoot → Restart / Reset if still stuck"
  echo ""
  echo "You can still use Chat without Docker infra (local Postgres + Ollama)."
  echo "Code Playground requires a working 'docker' command."
  echo ""
  return 1
}
