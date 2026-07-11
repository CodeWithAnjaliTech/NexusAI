"""Session management API routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_or_create_default_user
from app.db.models.message import Message
from app.db.models.session import Session
from app.db.session import get_db
from app.schemas.sessions import MessageResponse, SessionCreate, SessionResponse, SessionUpdate
from app.services.session_messages import message_to_response

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _session_response(session: Session, message_count: int) -> SessionResponse:
    return SessionResponse(
        id=session.id,
        user_id=session.user_id,
        title=session.title,
        status=session.status,
        project_id=session.project_id,
        created_at=session.created_at,
        updated_at=session.updated_at,
        message_count=message_count,
    )


@router.get("", response_model=list[SessionResponse])
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    project_id: UUID | None = None,
    limit: int = Query(default=100, ge=1, le=500),
) -> list[SessionResponse]:
    user = await get_or_create_default_user(db)
    query = select(Session).where(Session.user_id == user.id)
    if project_id:
        query = query.where(Session.project_id == project_id)
    query = query.order_by(Session.updated_at.desc()).limit(limit)
    result = await db.execute(query)
    sessions = result.scalars().all()

    responses = []
    for s in sessions:
        count_result = await db.execute(
            select(func.count()).select_from(Message).where(Message.session_id == s.id)
        )
        responses.append(_session_response(s, count_result.scalar() or 0))
    return responses


@router.post("", response_model=SessionResponse)
async def create_session(
    body: SessionCreate,
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    user = await get_or_create_default_user(db)
    session = Session(
        user_id=body.user_id or user.id,
        title=body.title,
        project_id=body.project_id,
    )
    db.add(session)
    await db.flush()
    return _session_response(session, 0)


@router.patch("/{session_id}", response_model=SessionResponse)
async def update_session(
    session_id: UUID,
    body: SessionUpdate,
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    user = await get_or_create_default_user(db)
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if body.title is not None:
        session.title = body.title
    if body.project_id is not None:
        session.project_id = body.project_id
    await db.flush()
    count_result = await db.execute(
        select(func.count()).select_from(Message).where(Message.session_id == session.id)
    )
    return _session_response(session, count_result.scalar() or 0)


@router.delete("/{session_id}")
async def delete_session(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    user = await get_or_create_default_user(db)
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.delete(session)
    return {"deleted": str(session_id)}


@router.get("/{session_id}/export")
async def export_session(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Message)
        .where(Message.session_id == session_id)
        .order_by(Message.created_at.asc())
    )
    messages = result.scalars().all()
    lines = ["# Chat Export\n", f"Session: `{session_id}`\n\n---\n"]
    for m in messages:
        role = m.role.upper()
        lines.append(f"**{role}** ({m.agent_id or 'user'})\n\n{m.content}\n\n---\n")
    return PlainTextResponse("\n".join(lines), media_type="text/markdown")


@router.get("/{session_id}/messages", response_model=list[MessageResponse])
async def get_messages(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> list[MessageResponse]:
    result = await db.execute(
        select(Message)
        .where(Message.session_id == session_id)
        .order_by(Message.created_at.asc())
    )
    messages = result.scalars().all()
    return [message_to_response(m) for m in messages]
