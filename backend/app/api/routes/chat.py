"""Chat API routes."""

import asyncio
import json
import time
from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.logging import logger
from app.db.models.custom_agent import CustomAgent
from app.db.models.message import Message
from app.db.models.session import Session
from app.db.models.user import User
from app.db.session import AsyncSessionLocal, get_db
from app.graph.state import NexusState
from app.graph.supervisor import run_supervisor
from app.schemas.chat import AgentKey, ChatRequest, ChatResponse
from app.services.analytics_service import analytics_service
from app.services.chat_streaming import prefetch_rag_citations, stream_llm_response
from app.services.diagram_prompts import (
    enforce_diagram_response,
    get_deterministic_diagram_response,
    iter_stream_chunks,
    should_buffer_diagram_response,
)
from app.services.rag_policy import should_use_document_rag
from app.services.memory_service import get_memory_service
from app.services.message_metadata import build_user_message_metadata
from app.services.router_service import build_router_event, resolve_agent_key, route_query
from app.services.user_preferences import get_github_settings

router = APIRouter(prefix="/chat", tags=["chat"])


async def _get_or_create_session(
    db: AsyncSession, session_id: UUID | None, user_id: UUID, project_id: UUID | None = None
) -> Session:
    if session_id:
        result = await db.execute(select(Session).where(Session.id == session_id))
        session = result.scalar_one_or_none()
        if session:
            if project_id and not session.project_id:
                session.project_id = project_id
            return session
        session = Session(user_id=user_id, title="New Conversation", project_id=project_id)
        db.add(session)
        await db.flush()
        return session

    session = Session(user_id=user_id, title="New Conversation", project_id=project_id)
    db.add(session)
    await db.flush()
    return session


async def _resolve_agent_config(
    db: AsyncSession, request: ChatRequest, user_id: UUID
) -> tuple[str, str | None, str | None]:
    """Return (agent_key, custom_system_prompt, force_agent)."""
    if request.custom_agent_id:
        result = await db.execute(
            select(CustomAgent).where(
                CustomAgent.id == request.custom_agent_id,
                CustomAgent.user_id == user_id,
                CustomAgent.status == "active",
            )
        )
        custom = result.scalar_one_or_none()
        if custom:
            return custom.base_agent_key, custom.system_prompt, custom.base_agent_key

    if request.force_agent:
        return request.force_agent.value, None, request.force_agent.value

    return "general", None, None


def _build_metadata(result: dict) -> str:
    return json.dumps(
        {
            "graph_events": result.get("graph_events", []),
            "citations": result.get("citations", []),
            "execution_result": result.get("execution_result"),
        }
    )


def _github_context(user: User) -> tuple[str, str]:
    gh = get_github_settings(user)
    return gh.get("repo_url") or "", gh.get("token") or ""


def _context_source(request: ChatRequest) -> str:
    return request.context_source.value


@router.post("", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChatResponse:
    user_id = request.user_id or user.id
    session = await _get_or_create_session(db, request.session_id, user_id, request.project_id)

    user_metadata = await build_user_message_metadata(db, document_id=request.document_id)
    user_msg = Message(
        session_id=session.id,
        role="user",
        content=request.message,
        metadata_json=user_metadata,
    )
    db.add(user_msg)
    await db.flush()

    agent_key, custom_prompt, force_agent = await _resolve_agent_config(db, request, user_id)

    memory_service = get_memory_service()
    memory_context = await memory_service.build_prompt_context(
        db, user_id=user_id, session_id=session.id, user=user
    )
    github_repo, github_token = _github_context(user)

    start = time.perf_counter()
    proj_id = str(request.project_id) if request.project_id else None
    deterministic = get_deterministic_diagram_response(request.message)
    if deterministic is not None:
        result = {
            "agent_response": deterministic,
            "selected_agent": "blueprint",
            "intent": "blueprint",
            "graph_events": [],
            "citations": [],
            "validation_passed": True,
        }
    else:
        result = await run_supervisor(
            user_query=request.message,
            session_id=str(session.id),
            user_id=str(user_id),
            force_agent=force_agent,
            document_id=str(request.document_id) if request.document_id else None,
            project_id=proj_id,
            custom_system_prompt=custom_prompt,
            memory_context=memory_context,
            github_repo_url=github_repo,
            github_token=github_token,
            context_source=_context_source(request),
        )
        result = {
            **result,
            "agent_response": enforce_diagram_response(request.message, result["agent_response"]),
        }
    duration_ms = int((time.perf_counter() - start) * 1000)

    response_content = result["agent_response"]

    assistant_msg = Message(
        session_id=session.id,
        role="assistant",
        content=response_content,
        agent_id=result.get("selected_agent"),
        intent=result.get("intent"),
        metadata_json=_build_metadata(result),
    )
    db.add(assistant_msg)
    await db.flush()

    try:
        await memory_service.persist_turn(
            db,
            user_id=user_id,
            session_id=session.id,
            user_query=request.message,
            assistant_response=response_content,
            agent_key=result.get("selected_agent", agent_key),
            intent=result.get("intent", "general"),
            message_id=assistant_msg.id,
        )
    except Exception as exc:
        logger.warning("Memory persist failed: %s", exc)

    try:
        await analytics_service.record_agent_run(
            db,
            agent_key=result.get("selected_agent", agent_key),
            intent=result.get("intent", "general"),
            duration_ms=duration_ms,
            success=bool(result.get("validation_passed")),
            user_id=user_id,
            organization_id=user.organization_id,
            session_id=session.id,
        )
    except Exception as exc:
        logger.warning("Analytics record failed: %s", exc)

    if session.title == "New Conversation":
        session.title = request.message[:80]

    return ChatResponse(
        session_id=session.id,
        message_id=assistant_msg.id,
        content=response_content,
        agent=result.get("selected_agent", agent_key),
        intent=result.get("intent", "general"),
        graph_events=result.get("graph_events", []),
        citations=result.get("citations", []),
        duration_ms=duration_ms,
    )


@router.post("/stream")
async def chat_stream(
    request: ChatRequest,
    user: User = Depends(get_current_user),
):
    """SSE streaming — uses a dedicated DB session so connections are not held for the full LLM run."""

    async def event_generator():
        async with AsyncSessionLocal() as db:
            try:
                user_id = request.user_id or user.id
                session = await _get_or_create_session(db, request.session_id, user_id, request.project_id)

                yield f"data: {json.dumps({'event': 'session', 'data': {'session_id': str(session.id)}})}\n\n"

                user_metadata = await build_user_message_metadata(db, document_id=request.document_id)
                user_msg = Message(
                    session_id=session.id,
                    role="user",
                    content=request.message,
                    metadata_json=user_metadata,
                )
                db.add(user_msg)
                await db.flush()

                agent_key, custom_prompt, force_agent = await _resolve_agent_config(db, request, user_id)
                doc_id = str(request.document_id) if request.document_id else None
                proj_id = str(request.project_id) if request.project_id else None
                ctx_source = _context_source(request)
                github_repo, github_token = _github_context(user)
                memory_service = get_memory_service()
                memory_context = await memory_service.build_prompt_context(
                    db, user_id=user_id, session_id=session.id, user=user
                )
                start = time.perf_counter()
                full_content = ""
                citations: list[dict] = []
                intent = "general"
                graph_events: list[dict] = []

                use_full_supervisor = force_agent == AgentKey.CODE_SANDBOX.value
                deterministic_content = get_deterministic_diagram_response(request.message)

                if deterministic_content is not None:
                    state: NexusState = {
                        "messages": [],
                        "user_query": request.message,
                        "session_id": str(session.id),
                        "user_id": str(user_id),
                        "force_agent": force_agent or "",
                        "document_id": doc_id or "",
                        "project_id": proj_id or "",
                        "custom_system_prompt": custom_prompt or "",
                        "memory_context": memory_context,
                        "github_repo_url": github_repo,
                        "github_token": github_token,
                        "context_source": ctx_source,
                        "intent": "",
                        "selected_agent": "",
                        "agent_response": "",
                        "retrieved_context": [],
                        "citations": [],
                        "graph_events": [],
                        "validation_passed": False,
                        "error": None,
                        "execution_result": None,
                    }
                    if not force_agent and not custom_prompt:
                        await asyncio.to_thread(route_query, state)
                        intent = state.get("intent", "blueprint")
                        agent_key = resolve_agent_key(state)
                    else:
                        intent = agent_key or "blueprint"
                    router_event = build_router_event(intent, agent_key)
                    graph_events.append(router_event)
                    yield f"data: {json.dumps({'event': 'graph_event', 'data': router_event})}\n\n"
                    full_content = deterministic_content
                    for chunk in iter_stream_chunks(full_content):
                        yield f"data: {json.dumps({'event': 'token', 'data': {'content': chunk}})}\n\n"
                elif use_full_supervisor:
                    result = await run_supervisor(
                        user_query=request.message,
                        session_id=str(session.id),
                        user_id=str(user_id),
                        force_agent=force_agent,
                        document_id=doc_id,
                        project_id=proj_id,
                        custom_system_prompt=custom_prompt,
                        memory_context=memory_context,
                        github_repo_url=github_repo,
                        github_token=github_token,
                        context_source=ctx_source,
                    )
                    graph_events = result.get("graph_events", [])
                    full_content = enforce_diagram_response(
                        request.message, result["agent_response"]
                    )
                    citations = result.get("citations", [])
                    intent = result.get("intent", "general")
                    agent_key = result.get("selected_agent", agent_key)
                    for event in graph_events:
                        yield f"data: {json.dumps({'event': 'graph_event', 'data': event})}\n\n"
                    for chunk in iter_stream_chunks(full_content):
                        yield f"data: {json.dumps({'event': 'token', 'data': {'content': chunk}})}\n\n"
                else:
                    state: NexusState = {
                        "messages": [],
                        "user_query": request.message,
                        "session_id": str(session.id),
                        "user_id": str(user_id),
                        "force_agent": force_agent or "",
                        "document_id": doc_id or "",
                        "project_id": proj_id or "",
                        "custom_system_prompt": custom_prompt or "",
                        "memory_context": memory_context,
                        "github_repo_url": github_repo,
                        "github_token": github_token,
                        "context_source": ctx_source,
                        "intent": "",
                        "selected_agent": "",
                        "agent_response": "",
                        "retrieved_context": [],
                        "citations": [],
                        "graph_events": [],
                        "validation_passed": False,
                        "error": None,
                        "execution_result": None,
                    }
                    if not force_agent and not custom_prompt:
                        await asyncio.to_thread(route_query, state)
                        intent = state.get("intent", "general")
                        agent_key = resolve_agent_key(state)
                    elif force_agent:
                        agent_key = force_agent
                        intent = force_agent

                    router_event = build_router_event(intent, agent_key)
                    graph_events.append(router_event)
                    yield f"data: {json.dumps({'event': 'graph_event', 'data': router_event})}\n\n"

                    use_rag = should_use_document_rag(request.message, doc_id, ctx_source, proj_id)
                    if use_rag:
                        try:
                            citations = await asyncio.wait_for(
                                prefetch_rag_citations(
                                    db,
                                    request.message,
                                    doc_id,
                                    proj_id,
                                    ctx_source,
                                ),
                                timeout=8.0,
                            )
                        except (TimeoutError, asyncio.TimeoutError, Exception):
                            citations = []

                    tool_events: list[dict] = []
                    if should_buffer_diagram_response(request.message):
                        buffered: list[str] = []
                        async for token in stream_llm_response(
                            user_query=request.message,
                            agent_key=agent_key,
                            custom_system_prompt=custom_prompt,
                            document_id=doc_id,
                            project_id=proj_id,
                            use_rag=use_rag,
                            memory_context=memory_context,
                            user=user,
                            github_repo_url=github_repo or None,
                            github_token=github_token or None,
                            context_source=ctx_source,
                            tool_events=tool_events,
                            db=db,
                        ):
                            buffered.append(token)
                        full_content = enforce_diagram_response(
                            request.message, "".join(buffered)
                        )
                        for chunk in iter_stream_chunks(full_content):
                            yield f"data: {json.dumps({'event': 'token', 'data': {'content': chunk}})}\n\n"
                    else:
                        async for token in stream_llm_response(
                            user_query=request.message,
                            agent_key=agent_key,
                            custom_system_prompt=custom_prompt,
                            document_id=doc_id,
                            project_id=proj_id,
                            use_rag=use_rag,
                            memory_context=memory_context,
                            user=user,
                            github_repo_url=github_repo or None,
                            github_token=github_token or None,
                            context_source=ctx_source,
                            tool_events=tool_events,
                            db=db,
                        ):
                            full_content += token
                            yield f"data: {json.dumps({'event': 'token', 'data': {'content': token}})}\n\n"

                    for event in tool_events:
                        graph_events.append(event)
                        yield f"data: {json.dumps({'event': 'graph_event', 'data': event})}\n\n"

                duration_ms = int((time.perf_counter() - start) * 1000)

                assistant_msg = Message(
                    session_id=session.id,
                    role="assistant",
                    content=full_content,
                    agent_id=agent_key,
                    intent=intent,
                    metadata_json=json.dumps({"citations": citations, "graph_events": graph_events}),
                )
                db.add(assistant_msg)
                await db.flush()

                try:
                    await memory_service.persist_turn(
                        db,
                        user_id=user_id,
                        session_id=session.id,
                        user_query=request.message,
                        assistant_response=full_content,
                        agent_key=agent_key,
                        intent=intent,
                        message_id=assistant_msg.id,
                    )
                except Exception as exc:
                    logger.warning("Memory persist failed: %s", exc)

                try:
                    await analytics_service.record_agent_run(
                        db,
                        agent_key=agent_key,
                        intent=intent,
                        duration_ms=duration_ms,
                        success=bool(full_content),
                        user_id=user_id,
                        organization_id=user.organization_id,
                        session_id=session.id,
                    )
                except Exception as exc:
                    logger.warning("Analytics record failed: %s", exc)

                if session.title == "New Conversation":
                    session.title = request.message[:80]

                await db.commit()

                yield f"data: {json.dumps({'event': 'done', 'data': {'message_id': str(assistant_msg.id), 'agent': agent_key, 'intent': intent, 'citations': citations, 'duration_ms': duration_ms}})}\n\n"

            except Exception as exc:
                logger.exception("Chat stream failed: %s", exc)
                await db.rollback()
                yield f"data: {json.dumps({'event': 'error', 'data': {'message': str(exc)[:300]}})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
