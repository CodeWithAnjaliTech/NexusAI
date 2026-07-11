#!/usr/bin/env bash
# Start NexusAI Docker services + pull Code Playground images.
# Run from project root after Docker Desktop shows "Engine running".

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck source=docker-utils.sh
source "$ROOT/scripts/docker-utils.sh"

require_docker 10 || exit 1
echo ""

echo "==> Starting NexusAI infrastructure containers..."
echo "    (Postgres :5433, Redis :6379, ChromaDB :8001)"
if ! docker_with_timeout 120 docker compose -f docker-compose.dev.yml up -d; then
  echo "ERROR: docker compose up timed out or failed."
  echo "Try manually: docker compose -f docker-compose.dev.yml up -d"
  exit 1
fi

echo ""
echo "==> Waiting for Postgres (max 45s)..."
TRIES=0
until docker_with_timeout 5 docker exec nexusai-postgres pg_isready -U nexusai -d nexusai >/dev/null 2>&1 || [[ $TRIES -ge 45 ]]; do
  sleep 1
  TRIES=$((TRIES + 1))
  printf "."
done
echo ""

if docker_with_timeout 5 docker exec nexusai-postgres pg_isready -U nexusai -d nexusai >/dev/null 2>&1; then
  echo "✓ nexusai-postgres  (localhost:5433)"
else
  echo "⚠ Postgres not ready yet — check: docker compose -f docker-compose.dev.yml logs postgres"
fi

if docker_with_timeout 5 docker exec nexusai-redis redis-cli ping >/dev/null 2>&1; then
  echo "✓ nexusai-redis     (localhost:6379)"
else
  echo "⚠ Redis still starting..."
fi

if curl -sf --max-time 5 http://localhost:8001/api/v1/heartbeat >/dev/null 2>&1; then
  echo "✓ nexusai-chromadb  (localhost:8001)"
else
  echo "⚠ ChromaDB still starting (may take ~30s)..."
fi

echo ""
echo "==> Pulling Code Playground images (first time only, ~1–3 min)..."
for img in python:3.12-alpine node:20-alpine golang:1.22-alpine eclipse-temurin:21-alpine; do
  echo "  pulling $img ..."
  docker_with_timeout 180 docker pull "$img" || echo "  ⚠ failed to pull $img (will retry on first playground run)"
done

echo ""
echo "==> Container status:"
docker_with_timeout 15 docker compose -f docker-compose.dev.yml ps || true

echo ""
echo "==> Next steps"
echo ""
echo "Option A — use Docker Postgres (recommended with these containers):"
echo "  cp backend/.env.docker backend/.env"
echo "  cd backend && source .venv/bin/activate && alembic upgrade head"
echo "  uvicorn app.main:app --reload --port 8000"
echo ""
echo "Option B — keep local Homebrew Postgres on :5432 (your current .env):"
echo "  Redis + ChromaDB from Docker; Postgres stays local."
echo "  cd backend && uvicorn app.main:app --reload --port 8000"
echo ""
echo "Then open http://localhost:5173/sandbox and click Run."
echo ""
echo "Verify: ./scripts/check-health.sh"
