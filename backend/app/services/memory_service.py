"""Memory service — short-term (Redis) and long-term (PostgreSQL)."""

import json
from datetime import datetime, timezone
from uuid import UUID

import redis.asyncio as aioredis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.logging import logger
from app.db.models.memory_entry import MemoryEntry
from app.db.models.session import Session
from app.services.reranker import get_reranker
from app.services.user_preferences import load_preferences
from app.services.vector_store import get_vector_store


class MemoryService:
    """Unified memory layer for sessions and semantic search."""

    def __init__(self) -> None:
        self._settings = get_settings()
        self._redis: aioredis.Redis | None = None

    async def _get_redis(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(
                self._settings.redis_url,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
        return self._redis

    async def get_session_context(self, session_id: UUID) -> list[dict]:
        try:
            redis = await self._get_redis()
            raw = await redis.get(f"session:{session_id}:context")
            if raw:
                return json.loads(raw)
        except Exception as exc:
            logger.warning("Redis session context unavailable: %s", exc)
        return []

    async def set_session_context(self, session_id: UUID, context: list[dict]) -> None:
        try:
            redis = await self._get_redis()
            await redis.set(
                f"session:{session_id}:context",
                json.dumps(context[-20:]),
                ex=86400,
            )
        except Exception as exc:
            logger.warning("Redis session context write failed: %s", exc)

    async def append_session_turn(
        self,
        session_id: UUID,
        *,
        user_query: str,
        agent_response: str,
        agent_key: str,
        intent: str,
    ) -> None:
        context = await self.get_session_context(session_id)
        context.extend(
            [
                {"role": "user", "content": user_query[:800]},
                {
                    "role": "assistant",
                    "content": agent_response[:800],
                    "agent": agent_key,
                    "intent": intent,
                },
            ]
        )
        await self.set_session_context(session_id, context)

    async def save_long_term(
        self,
        db: AsyncSession,
        user_id: UUID,
        session_id: UUID,
        key: str,
        value: str,
        memory_type: str = "conversation",
    ) -> MemoryEntry:
        entry = MemoryEntry(
            user_id=user_id,
            session_id=session_id,
            memory_type=memory_type,
            key=key,
            value=value,
        )
        db.add(entry)
        await db.flush()
        return entry

    async def persist_turn(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        session_id: UUID,
        user_query: str,
        assistant_response: str,
        agent_key: str,
        intent: str,
        message_id: UUID | None = None,
    ) -> None:
        """Save short-term (Redis) and long-term (PostgreSQL) memory for a chat turn."""
        await self.append_session_turn(
            session_id,
            user_query=user_query,
            agent_response=assistant_response,
            agent_key=agent_key,
            intent=intent,
        )
        suffix = str(message_id) if message_id else "latest"
        meta = json.dumps(
            {
                "agent": agent_key,
                "intent": intent,
                "message_id": str(message_id) if message_id else None,
            }
        )
        user_entry = await self.save_long_term(
            db,
            user_id=user_id,
            session_id=session_id,
            key=f"user:{suffix}",
            value=user_query[:1500],
            memory_type="conversation",
        )
        user_entry.metadata_json = meta
        assistant_entry = await self.save_long_term(
            db,
            user_id=user_id,
            session_id=session_id,
            key=f"assistant:{suffix}",
            value=assistant_response[:2000],
            memory_type="conversation",
        )
        assistant_entry.metadata_json = meta

    async def build_prompt_context(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        session_id: UUID,
        user: object | None = None,
    ) -> str:
        """Build memory context injected into agent prompts."""
        parts: list[str] = []

        session_ctx = await self.get_session_context(session_id)
        if len(session_ctx) > 2:
            recent = session_ctx[-6:]
            lines = []
            for turn in recent:
                role = turn.get("role", "user")
                content = turn.get("content", "")
                if role == "assistant" and turn.get("agent"):
                    lines.append(f"{role} ({turn['agent']}): {content}")
                else:
                    lines.append(f"{role}: {content}")
            parts.append("Recent conversation memory:\n" + "\n".join(lines))

        if user is not None:
            prefs = load_preferences(user)  # type: ignore[arg-type]
            notes = prefs.get("memory_notes", [])
            if notes:
                parts.append("User preferences:\n" + "\n".join(f"- {n}" for n in notes[:5]))

        result = await db.execute(
            select(MemoryEntry)
            .where(MemoryEntry.user_id == user_id, MemoryEntry.memory_type == "preference")
            .order_by(MemoryEntry.created_at.desc())
            .limit(3)
        )
        pref_entries = list(result.scalars().all())
        if pref_entries:
            parts.append(
                "Saved preferences:\n"
                + "\n".join(f"- {entry.value[:200]}" for entry in pref_entries)
            )

        return "\n\n".join(parts)

    async def get_user_memories(
        self, db: AsyncSession, user_id: UUID, limit: int = 50
    ) -> list[MemoryEntry]:
        result = await db.execute(
            select(MemoryEntry)
            .where(MemoryEntry.user_id == user_id)
            .order_by(MemoryEntry.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    @staticmethod
    def _parse_entry_key(key: str) -> tuple[str, str] | None:
        if key.startswith("user:"):
            return "user", key[5:]
        if key.startswith("assistant:"):
            return "assistant", key[10:]
        return None

    @staticmethod
    def _entry_metadata(entry: MemoryEntry) -> dict:
        try:
            return json.loads(entry.metadata_json or "{}")
        except json.JSONDecodeError:
            return {}

    async def get_conversation_turns(
        self, db: AsyncSession, user_id: UUID, limit: int = 30
    ) -> list[dict]:
        result = await db.execute(
            select(MemoryEntry)
            .where(MemoryEntry.user_id == user_id, MemoryEntry.memory_type == "conversation")
            .order_by(MemoryEntry.created_at.desc())
            .limit(limit * 4)
        )
        entries = list(result.scalars().all())

        turns: dict[str, dict] = {}
        for entry in entries:
            parsed = self._parse_entry_key(entry.key)
            if not parsed:
                continue
            role, turn_id = parsed
            if turn_id not in turns:
                turns[turn_id] = {
                    "turn_id": turn_id,
                    "session_id": entry.session_id,
                    "user_message": "",
                    "assistant_message": None,
                    "agent_key": None,
                    "intent": None,
                    "created_at": entry.created_at,
                    "user_entry_id": None,
                    "assistant_entry_id": None,
                }
            turn = turns[turn_id]
            meta = self._entry_metadata(entry)
            if meta.get("agent") and not turn["agent_key"]:
                turn["agent_key"] = meta["agent"]
            if meta.get("intent") and not turn["intent"]:
                turn["intent"] = meta["intent"]
            if role == "user":
                turn["user_message"] = entry.value
                turn["user_entry_id"] = entry.id
            else:
                turn["assistant_message"] = entry.value
                turn["assistant_entry_id"] = entry.id
            if entry.created_at and (
                turn["created_at"] is None or entry.created_at > turn["created_at"]
            ):
                turn["created_at"] = entry.created_at

        session_ids = {t["session_id"] for t in turns.values() if t["session_id"]}
        session_titles: dict[UUID, str] = {}
        if session_ids:
            sessions_result = await db.execute(
                select(Session).where(Session.id.in_(session_ids), Session.user_id == user_id)
            )
            for session in sessions_result.scalars().all():
                session_titles[session.id] = session.title or "Untitled chat"

        grouped = [
            {
                **turn,
                "session_title": session_titles.get(turn["session_id"]) if turn["session_id"] else None,
            }
            for turn in turns.values()
            if turn["user_message"] or turn["assistant_message"]
        ]
        grouped.sort(key=lambda t: t["created_at"] or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
        return grouped[:limit]

    async def delete_memory_entry(self, db: AsyncSession, user_id: UUID, entry_id: UUID) -> bool:
        result = await db.execute(
            select(MemoryEntry).where(MemoryEntry.id == entry_id, MemoryEntry.user_id == user_id)
        )
        entry = result.scalar_one_or_none()
        if not entry:
            return False
        await db.delete(entry)
        return True

    async def delete_conversation_turn(self, db: AsyncSession, user_id: UUID, turn_id: str) -> int:
        result = await db.execute(
            select(MemoryEntry).where(
                MemoryEntry.user_id == user_id,
                MemoryEntry.memory_type == "conversation",
                MemoryEntry.key.in_([f"user:{turn_id}", f"assistant:{turn_id}"]),
            )
        )
        entries = list(result.scalars().all())
        for entry in entries:
            await db.delete(entry)
        return len(entries)

    async def clear_conversation_memories(self, db: AsyncSession, user_id: UUID) -> int:
        result = await db.execute(
            select(MemoryEntry).where(
                MemoryEntry.user_id == user_id,
                MemoryEntry.memory_type == "conversation",
            )
        )
        entries = list(result.scalars().all())
        for entry in entries:
            await db.delete(entry)
        return len(entries)

    def semantic_search(
        self,
        query: str,
        limit: int = 5,
        project_id: str | None = None,
    ) -> list[dict]:
        vector_store = get_vector_store()
        if vector_store is None:
            logger.warning("Semantic search skipped — ChromaDB unavailable")
            return []

        settings = get_settings()
        fetch_k = settings.rag_fetch_k if settings.rag_rerank_enabled else limit
        results = vector_store.search(query, n_results=fetch_k, project_id=project_id)
        if settings.rag_rerank_enabled and results:
            return get_reranker().rerank(query, results, top_k=limit)
        return results[:limit]


def get_memory_service() -> MemoryService:
    return MemoryService()

