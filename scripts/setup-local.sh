#!/usr/bin/env bash
# NexusAI — local development WITHOUT Docker containers for Postgres/Redis/Chroma.
# Requires: Homebrew PostgreSQL, Python venv, Node, Ollama.
# Code Playground still needs Docker Desktop if SANDBOX_USE_DOCKER=true.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/backend"

echo "==> NexusAI local setup (no Docker infra)"
echo ""

# --- PostgreSQL (Homebrew on port 5432) ---
if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql not found. Install PostgreSQL:"
  echo "  brew install postgresql@16 && brew services start postgresql@16"
  exit 1
fi

if ! pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
  echo "ERROR: PostgreSQL is not running on port 5432."
  echo "  brew services start postgresql@16"
  exit 1
fi

echo "✓ PostgreSQL running on :5432"

DB_USER="${NEXUSAI_DB_USER:-nexusai}"
DB_PASS="${NEXUSAI_DB_PASS:-nexusai_dev}"
DB_NAME="${NEXUSAI_DB_NAME:-nexusai}"

psql -h localhost -p 5432 -d postgres -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}' CREATEDB;
  END IF;
END
\$\$;
SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\gexec
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
SQL

echo "✓ Database '${DB_NAME}' ready"

# --- Backend venv + migrations ---
cd "$BACKEND"
if [[ ! -d .venv ]]; then
  echo "==> Creating Python venv..."
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "✓ Created backend/.env from .env.example"
fi

export DATABASE_URL="postgresql+asyncpg://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"
.venv/bin/alembic upgrade head
echo "✓ Migrations applied"

# --- Ollama ---
if curl -sf --max-time 3 http://localhost:11434/api/tags >/dev/null; then
  echo "✓ Ollama running"
else
  echo "⚠ Ollama not reachable at :11434 — start it for chat:"
  echo "  ollama serve && ollama pull llama3.2 && ollama pull nomic-embed-text"
fi

# --- Optional services ---
if pg_isready -h localhost -p 5432 >/dev/null 2>&1; then true; fi
if command -v redis-cli >/dev/null && redis-cli ping >/dev/null 2>&1; then
  echo "✓ Redis running (memory cache enabled)"
else
  echo "⚠ Redis not running — chat still works; install with: brew install redis && brew services start redis"
fi

if curl -sf --max-time 3 http://localhost:8001/api/v1/heartbeat >/dev/null; then
  echo "✓ ChromaDB running (Knowledge/RAG enabled)"
else
  echo "⚠ ChromaDB not on :8001 — chat works; Knowledge indexing needs Docker or: docker compose -f docker-compose.dev.yml up -d chromadb"
fi

echo ""
echo "==> Start the app:"
echo "  Terminal 1: cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000"
echo "  Terminal 2: cd frontend && cp -n .env.example .env.local 2>/dev/null; npm run dev"
echo "  Open: http://localhost:5173"
