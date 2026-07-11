#!/usr/bin/env bash
# Start Docker infrastructure (Postgres, Redis, ChromaDB) and run migrations.
# Backend and frontend still run on your host for fast reload.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/backend"
# shellcheck source=docker-utils.sh
source "$ROOT/scripts/docker-utils.sh"

echo "==> Starting NexusAI Docker infrastructure..."
cd "$ROOT"

require_docker 10 || exit 1

docker compose -f docker-compose.dev.yml up -d

echo "==> Waiting for services to become healthy..."
TRIES=0
until docker compose -f docker-compose.dev.yml ps --format json 2>/dev/null | grep -q '"Health":"healthy"' || [[ $TRIES -ge 60 ]]; do
  sleep 2
  TRIES=$((TRIES + 1))
  printf "."
done
echo ""

# Wait for postgres specifically
TRIES=0
until docker exec nexusai-postgres pg_isready -U nexusai -d nexusai >/dev/null 2>&1 || [[ $TRIES -ge 30 ]]; do
  sleep 1
  TRIES=$((TRIES + 1))
done

if ! docker exec nexusai-postgres pg_isready -U nexusai -d nexusai >/dev/null 2>&1; then
  echo "ERROR: Postgres did not become ready. Check: docker compose -f docker-compose.dev.yml logs postgres"
  exit 1
fi

echo "✓ Postgres  → localhost:5433"
echo "✓ Redis     → localhost:6379"
echo "✓ ChromaDB  → localhost:8001"

cd "$BACKEND"
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt
fi

# Use Docker Postgres URL
export DATABASE_URL="postgresql+asyncpg://nexusai:nexusai_dev@localhost:5433/nexusai"
.venv/bin/alembic upgrade head
echo "✓ Migrations applied (Docker Postgres on :5433)"

echo ""
echo "Tip: set in backend/.env for Docker infra:"
echo "  DATABASE_URL=postgresql+asyncpg://nexusai:nexusai_dev@localhost:5433/nexusai"
echo ""
echo "==> Start the app:"
echo "  cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000"
echo "  cd frontend && npm run dev"
