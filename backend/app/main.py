"""FastAPI application entry point."""

import asyncio
import json
from contextlib import asynccontextmanager
from uuid import UUID

from fastapi import Depends, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_or_create_default_user, seed_agents, seed_default_organization
from app.api.routes import (
    agents,
    analytics,
    audit,
    auth,
    chat,
    code_review,
    config,
    custom_agents,
    documents,
    graph_state,
    integrations,
    memory,
    projects,
    sandbox,
    sessions,
    upload,
    workflows,
)
from app.config import get_settings
from app.core.logging import logger, setup_logging
from app.db.models.message import Message
from app.db.models.session import Session
from app.db.session import get_db
from app.graph.supervisor import run_supervisor
from app.middleware.rate_limit import RateLimitMiddleware
from app.services.tracing import configure_tracing
from app.websocket.manager import ws_manager

settings = get_settings()


def _prewarm_sandbox_images() -> None:
    from app.services.code_executor import prewarm_sandbox_images

    try:
        prewarm_sandbox_images()
    except Exception as exc:
        logger.warning("Sandbox pre-warm failed: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    configure_tracing()
    logger.info("Starting %s [%s]", settings.app_name, settings.app_env)

    from app.db.session import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as db:
            await seed_default_organization(db)
            await seed_agents(db)
            await get_or_create_default_user(db)
            await db.commit()
    except (TimeoutError, OSError, ConnectionRefusedError) as exc:
        logger.error(
            "Database unavailable at %s — start dependencies first:\n"
            "  cd .. && docker compose up -d postgres redis chromadb\n"
            "  cd backend && alembic upgrade head",
            settings.database_url.split("@")[-1],
        )
        raise RuntimeError(
            "PostgreSQL is not running. Start Docker services with "
            "'docker compose up -d postgres redis chromadb' from the project root, "
            "then run 'alembic upgrade head' in backend/."
        ) from exc

    if settings.sandbox_use_docker and settings.sandbox_prewarm_on_startup:
        asyncio.create_task(asyncio.to_thread(_prewarm_sandbox_images))

    yield
    logger.info("Shutting down %s", settings.app_name)


app = FastAPI(
    title=settings.app_name,
    description="Unified Polymath Workspace — Multi-Agent AI Platform",
    version="0.5.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(
    RateLimitMiddleware,
    redis_url=settings.redis_url,
    max_requests=settings.rate_limit_requests,
    window_seconds=settings.rate_limit_window_seconds,
)

api_prefix = settings.api_v1_prefix
app.include_router(auth.router, prefix=api_prefix)
app.include_router(chat.router, prefix=api_prefix)
app.include_router(sandbox.router, prefix=api_prefix)
app.include_router(upload.router, prefix=api_prefix)
app.include_router(documents.router, prefix=api_prefix)
app.include_router(agents.router, prefix=api_prefix)
app.include_router(sessions.router, prefix=api_prefix)
app.include_router(graph_state.router, prefix=api_prefix)
app.include_router(memory.router, prefix=api_prefix)
app.include_router(analytics.router, prefix=api_prefix)
app.include_router(projects.router, prefix=api_prefix)
app.include_router(custom_agents.router, prefix=api_prefix)
app.include_router(audit.router, prefix=api_prefix)
app.include_router(integrations.router, prefix=api_prefix)
app.include_router(code_review.router, prefix=api_prefix)
app.include_router(config.router, prefix=api_prefix)
app.include_router(workflows.router, prefix=api_prefix)


@app.get("/health")
async def health():
    return {"status": "healthy", "app": settings.app_name, "version": "0.5.0"}


@app.get(f"{api_prefix}/health/status")
async def health_status(db: AsyncSession = Depends(get_db)):
    """Check backend, database, ChromaDB, Redis, Ollama, and Docker availability."""
    import subprocess

    import httpx
    from sqlalchemy import text

    from app.services.vector_store import chroma_is_reachable

    checks: dict[str, str] = {}
    hints: dict[str, str] = {}

    try:
        await db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "error"
        hints["database"] = "PostgreSQL is required. Run ./scripts/setup-local.sh or docker compose up postgres -d"

    checks["chromadb"] = "ok" if chroma_is_reachable(settings) else "unavailable"
    if checks["chromadb"] != "ok":
        hints["chromadb"] = "Knowledge search and RAG need ChromaDB: docker compose up -d chromadb"

    try:
        import redis.asyncio as aioredis

        client = aioredis.from_url(settings.redis_url, decode_responses=True, socket_connect_timeout=2)
        await client.ping()
        await client.aclose()
        checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "unavailable"
        hints["redis"] = "Memory cache and analytics use Redis: docker compose up -d redis"

    try:
        response = httpx.get(f"{settings.ollama_base_url.rstrip('/')}/api/tags", timeout=3)
        checks["ollama"] = "ok" if response.status_code == 200 else "unavailable"
    except Exception:
        checks["ollama"] = "unavailable"
        hints["ollama"] = "Chat requires Ollama: ollama serve && ollama pull llama3.2"

    try:
        proc = subprocess.run(
            ["docker", "info"],
            capture_output=True,
            timeout=5,
            check=False,
        )
        checks["docker"] = "ok" if proc.returncode == 0 else "unavailable"
    except Exception:
        checks["docker"] = "unavailable"
        hints["docker"] = "Code Playground needs Docker Desktop running"

    checks["backend"] = "ok"
    required = {"database", "backend"}
    optional = {"chromadb", "redis", "docker", "ollama"}
    overall = "healthy"
    if any(checks.get(name) != "ok" for name in required):
        overall = "degraded"
    elif any(checks.get(name) != "ok" for name in optional):
        overall = "degraded"

    return {
        "status": overall,
        "checks": checks,
        "hints": hints,
        "required_services": sorted(required),
        "optional_services": sorted(optional),
    }

@app.get("/")
async def root():
    return {
        "name": "NexusAI API",
        "status": "running",
        "version": "1.0.0"
    }

@app.websocket("/ws/chat/{session_id}")
async def websocket_chat(
    websocket: WebSocket,
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    await ws_manager.connect(session_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            message = data.get("message", "")
            if not message:
                continue

            await ws_manager.send_json(session_id, {"event": "typing", "data": {"status": "processing"}})

            user = await get_or_create_default_user(db)
            session_uuid = UUID(session_id) if session_id else None

            if session_uuid:
                result_db = await db.execute(
                    select(Session).where(Session.id == session_uuid)
                )
                session = result_db.scalar_one_or_none()
            else:
                session = None

            if not session:
                session = Session(user_id=user.id, title=message[:80])
                db.add(session)
                await db.flush()

            user_msg = Message(session_id=session.id, role="user", content=message)
            db.add(user_msg)
            await db.flush()

            await ws_manager.send_json(
                session_id,
                {"event": "graph_event", "data": {"node": "user_query", "type": "input", "label": "User Query", "status": "completed"}},
            )

            from app.services.memory_service import get_memory_service
            from app.services.user_preferences import get_github_settings

            memory_service = get_memory_service()
            memory_context = await memory_service.build_prompt_context(
                db, user_id=user.id, session_id=session.id, user=user
            )
            gh = get_github_settings(user)
            github_repo = gh.get("repo_url") or ""
            github_token = gh.get("token") or ""

            result = await run_supervisor(
                user_query=message,
                session_id=str(session.id),
                user_id=str(user.id),
                memory_context=memory_context,
                github_repo_url=github_repo,
                github_token=github_token,
                context_source="auto",
            )

            for event in result.get("graph_events", []):
                await ws_manager.send_json(session_id, {"event": "graph_event", "data": event})

            assistant_msg = Message(
                session_id=session.id,
                role="assistant",
                content=result["agent_response"],
                agent_id=result.get("selected_agent"),
                intent=result.get("intent"),
                metadata_json=json.dumps(
                    {
                        "graph_events": result.get("graph_events", []),
                        "citations": result.get("citations", []),
                    }
                ),
            )
            db.add(assistant_msg)
            await db.commit()

            await ws_manager.send_json(
                session_id,
                {
                    "event": "message",
                    "data": {
                        "content": result["agent_response"],
                        "agent": result.get("selected_agent"),
                        "intent": result.get("intent"),
                        "message_id": str(assistant_msg.id),
                        "session_id": str(session.id),
                        "citations": result.get("citations", []),
                    },
                },
            )

    except WebSocketDisconnect:
        ws_manager.disconnect(session_id, websocket)
    except Exception as exc:
        logger.error("WebSocket error: %s", exc)
        ws_manager.disconnect(session_id, websocket)
