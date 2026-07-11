"""Memory search API routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_auth
from app.db.models.user import User
from app.db.session import get_db
from app.schemas.memory import (
    ConversationTurnResponse,
    MemoryEntryResponse,
    MemorySearchRequest,
    MemorySearchResponse,
    MemorySearchResult,
)
from app.services.memory_service import get_memory_service

router = APIRouter(prefix="/memory", tags=["memory"])


@router.post("/search", response_model=MemorySearchResponse)
async def search_memory(
    request: MemorySearchRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
) -> MemorySearchResponse:
    memory_service = get_memory_service()
    results = memory_service.semantic_search(
        request.query,
        limit=request.limit,
        project_id=str(request.project_id) if request.project_id else None,
    )

    return MemorySearchResponse(
        query=request.query,
        results=[
            MemorySearchResult(
                id=r["id"],
                content=r["content"],
                score=r["score"],
                metadata=r.get("metadata", {}),
            )
            for r in results
        ],
        total=len(results),
    )


@router.get("/entries", response_model=list[MemoryEntryResponse])
async def list_memory_entries(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
) -> list[MemoryEntryResponse]:
    memory_service = get_memory_service()
    entries = await memory_service.get_user_memories(db, user.id)
    return [
        MemoryEntryResponse(
            id=entry.id,
            memory_type=entry.memory_type,
            key=entry.key,
            value=entry.value,
            created_at=entry.created_at,
            session_id=entry.session_id,
            agent_key=memory_service._entry_metadata(entry).get("agent"),
            intent=memory_service._entry_metadata(entry).get("intent"),
        )
        for entry in entries
    ]


@router.get("/conversations", response_model=list[ConversationTurnResponse])
async def list_conversation_turns(
    limit: int = 30,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
) -> list[ConversationTurnResponse]:
    memory_service = get_memory_service()
    turns = await memory_service.get_conversation_turns(db, user.id, limit=min(limit, 100))
    return [ConversationTurnResponse.model_validate(turn) for turn in turns]


@router.delete("/entries/{entry_id}")
async def delete_memory_entry(
    entry_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
) -> dict:
    memory_service = get_memory_service()
    deleted = await memory_service.delete_memory_entry(db, entry_id, user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Memory entry not found")
    return {"deleted": str(entry_id)}


@router.delete("/turns/{turn_id}")
async def delete_conversation_turn(
    turn_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
) -> dict:
    memory_service = get_memory_service()
    count = await memory_service.delete_conversation_turn(db, user.id, turn_id)
    if count == 0:
        raise HTTPException(status_code=404, detail="Conversation turn not found")
    return {"deleted": count, "turn_id": turn_id}


@router.delete("/conversations")
async def clear_conversation_memories(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
) -> dict:
    memory_service = get_memory_service()
    count = await memory_service.clear_conversation_memories(db, user.id)
    return {"deleted": count}
