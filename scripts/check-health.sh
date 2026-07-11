#!/usr/bin/env bash
# Verify all NexusAI services (local or Docker).

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ok() { echo "✓ $1"; }
warn() { echo "⚠ $1"; }
fail() { echo "✗ $1"; }

echo "==> NexusAI health check"
echo ""

# Backend
if curl -sf --max-time 5 http://127.0.0.1:8000/health >/dev/null; then
  ok "Backend API     http://localhost:8000"
else
  fail "Backend API     not running on :8000"
fi

# Frontend
if curl -sf --max-time 3 http://127.0.0.1:5173 >/dev/null 2>&1; then
  ok "Frontend        http://localhost:5173"
else
  warn "Frontend        not running on :5173"
fi

# Postgres — try Docker first, then local
if pg_isready -h localhost -p 5433 >/dev/null 2>&1 || docker exec nexusai-postgres pg_isready -U nexusai >/dev/null 2>&1; then
  ok "PostgreSQL      localhost:5433 (Docker)"
elif pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
  ok "PostgreSQL      localhost:5432 (local Homebrew)"
else
  fail "PostgreSQL      not reachable on :5432 or :5433"
fi

# Redis
if docker exec nexusai-redis redis-cli ping >/dev/null 2>&1; then
  ok "Redis           Docker :6379"
elif command -v redis-cli >/dev/null && redis-cli ping >/dev/null 2>&1; then
  ok "Redis           local :6379"
else
  warn "Redis           not running (optional — chat still works)"
fi

# Chroma
if curl -sf --max-time 3 http://localhost:8001/api/v1/heartbeat >/dev/null; then
  ok "ChromaDB        localhost:8001"
else
  warn "ChromaDB        not running (optional — chat works; Knowledge/RAG disabled)"
fi

# Ollama
if curl -sf --max-time 3 http://localhost:11434/api/tags >/dev/null; then
  ok "Ollama          localhost:11434"
else
  fail "Ollama          not running — required for chat"
fi

# Docker (sandbox)
# shellcheck source=docker-utils.sh
source "$ROOT/scripts/docker-utils.sh"
if docker_with_timeout 8 docker info >/dev/null 2>&1; then
  ok "Docker Engine   running (Code Playground sandbox)"
else
  warn "Docker Engine   not responding (Code Playground disabled) — restart Docker Desktop"
fi

echo ""
if curl -sf --max-time 5 http://127.0.0.1:8000/api/v1/health/status >/dev/null; then
  echo "Detailed status:"
  curl -s http://127.0.0.1:8000/api/v1/health/status | python3 -m json.tool 2>/dev/null || true
fi
