"""Session message serialization helpers."""

import json

from app.db.models.message import Message
from app.schemas.sessions import MessageAttachment, MessageResponse
from app.services.message_metadata import attachments_from_metadata, citations_from_metadata


def message_to_response(message: Message) -> MessageResponse:
    attachments_raw = attachments_from_metadata(message.metadata_json)
    attachments = [MessageAttachment.model_validate(item) for item in attachments_raw]
    return MessageResponse(
        id=message.id,
        role=message.role,
        content=message.content,
        agent_id=message.agent_id,
        intent=message.intent,
        created_at=message.created_at,
        attachments=attachments,
        citations=citations_from_metadata(message.metadata_json),
    )
