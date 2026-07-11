# NexusAI: The Unified Polymath Workspace

A stateful multi-agent AI platform that dynamically routes user requests to specialized agents using LangGraph.

## Features

| Area | Capabilities |
|------|----------------|
| **Chat** | Multi-agent routing, mode selector, chat history sidebar, SSE streaming, markdown + Mermaid, file attachments |
| **Code Sandbox** | 21 languages, Docker-only isolation, dedicated Playground page |
| **Knowledge** | PDF/image preview, document listing, scoped RAG by document & project |
| **Projects** | Workspace-scoped uploads, chat sessions, and RAG retrieval |
| **Custom Agents** | Create, delete, and launch custom agents from Chat |
| **Auth** | JWT login/register, protected routes (guest mode for dev) |
| **Analytics** | Agent metrics, usage tracking |
| **Audit** | Activity log, chat export as Markdown |
| **Code review** | Upload project .zip — AI scans security, architecture, quality, tests, docs |
| **Integrations** | GitHub connect, multi-provider LLM (Ollama/OpenAI/Anthropic) |

## Quick Start

Choose **one** setup path:

### Option A — No Docker infra (simplest on Mac)

Uses Homebrew PostgreSQL + Ollama on your machine. Redis and ChromaDB are **optional** (chat works without them).

```bash
./scripts/setup-local.sh
# Terminal 1
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000
# Terminal 2
cd frontend && cp .env.example .env.local && npm run dev
```

Or manually: `cp backend/.env.local backend/.env`

### Option B — Docker for Postgres, Redis, ChromaDB

```bash
./scripts/setup-docker.sh
# Then start backend + frontend as above
# Use: cp backend/.env.docker backend/.env
```

### Option C — Full stack in Docker

```bash
docker compose up -d
# Backend at :8000, frontend at :5173
```

### Verify everything

```bash
./scripts/check-health.sh
```

| Service | Required? | Local (no Docker) | Docker infra |
|---------|-----------|-------------------|--------------|
| PostgreSQL | **Yes** | Homebrew `:5432` | Container `:5433` |
| Ollama | **Yes** (chat) | `ollama serve` | same |
| Redis | Optional | `brew install redis` | Docker `:6379` |
| ChromaDB | Optional (RAG) | skip or Docker `:8001` | Docker `:8001` |
| Docker Engine | Optional | Code Playground only | Code Playground only |

## Environment

### Backend (`backend/.env`)

```env
SANDBOX_USE_DOCKER=true
LLM_PROVIDER=ollama          # ollama | openai | anthropic
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
SANDBOX_MAX_CONCURRENT=5
SANDBOX_PREWARM_ON_STARTUP=true
SANDBOX_TIMEOUT_SECONDS=45
```

Restart the backend after changing sandbox settings. Ensure **Docker Desktop is running** for the Code Playground.

### Frontend (`frontend/.env.local`)

```env
VITE_ALLOW_GUEST=true          # skip login in development
VITE_API_URL=http://localhost:8000
```

## API Highlights

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/chat/stream` | Streaming chat (SSE) |
| GET | `/api/v1/sessions` | List chat history |
| GET | `/api/v1/sessions/{id}/export` | Export chat as Markdown |
| GET | `/api/v1/documents` | List uploaded files |
| GET | `/api/v1/documents/{id}/file` | Serve file for preview |
| GET | `/api/v1/sandbox/languages` | Supported sandbox languages |
| POST | `/api/v1/projects` | Create project workspace |
| POST | `/api/v1/code-review/analyze` | AI review of uploaded project zip |
| POST | `/api/v1/custom-agents` | Create custom agent |
| GET | `/api/v1/audit` | Audit log |

## Migrations

```bash
cd backend && alembic upgrade head
```

Migrations: `001_initial` → `002_phases_2_5` → `003_projects_agents_audit` → `004_workflows`

## Tests

```bash
cd backend && pytest tests/ -v
cd frontend && npm run build
```

## Architecture

See **[docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md)** for full implementation details, flows, and file reference.

```
User → Chat UI → POST /chat/stream → LangGraph Supervisor
  → Intent Classifier (or force_agent) → Agent → Memory/RAG/Sandbox → Response
```

## Deploy

- Frontend → Vercel (`frontend/vercel.json`)
- Backend → Render (`render.yaml`) — requires Docker for sandbox
