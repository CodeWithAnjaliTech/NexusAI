"""Memory service conversation grouping tests."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.db.models.memory_entry import MemoryEntry
from app.services.memory_service import MemoryService


def _entry(key: str, value: str, *, session_id=None, created_at=None, meta=None):
    entry = MemoryEntry(
        id=uuid4(),
        user_id=uuid4(),
        session_id=session_id,
        memory_type="conversation",
        key=key,
        value=value,
    )
    entry.created_at = created_at or datetime.now(timezone.utc)
    if meta:
        import json

        entry.metadata_json = json.dumps(meta)
    return entry


@pytest.mark.asyncio
async def test_get_conversation_turns_groups_user_and_assistant():
    service = MemoryService()
    user_id = uuid4()
    session_id = uuid4()
    turn_id = str(uuid4())
    now = datetime.now(timezone.utc)
    meta = {"agent": "documentation", "intent": "documentation"}

    entries = [
        _entry(f"user:{turn_id}", "Explain this doc", session_id=session_id, created_at=now, meta=meta),
        _entry(
            f"assistant:{turn_id}",
            "Here is the summary",
            session_id=session_id,
            created_at=now,
            meta=meta,
        ),
    ]

    class EntryResult:
        def scalars(self):
            return self

        def all(self):
            return entries

    class SessionResult:
        def scalars(self):
            return self

        def all(self):
            session = MagicMock()
            session.id = session_id
            session.title = "Doc help"
            return [session]

    fake_db = AsyncMock()
    fake_db.execute = AsyncMock(side_effect=[EntryResult(), SessionResult()])

    turns = await service.get_conversation_turns(fake_db, user_id, limit=10)

    assert len(turns) == 1
    assert turns[0]["turn_id"] == turn_id
    assert turns[0]["user_message"] == "Explain this doc"
    assert turns[0]["assistant_message"] == "Here is the summary"
    assert turns[0]["agent_key"] == "documentation"
    assert turns[0]["session_title"] == "Doc help"
