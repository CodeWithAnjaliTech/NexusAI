"""Audit logging service."""

import json
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.audit_log import AuditLog


class AuditService:
    async def log(
        self,
        db: AsyncSession,
        action: str,
        resource_type: str,
        resource_id: str | None = None,
        user_id: UUID | None = None,
        organization_id: UUID | None = None,
        metadata: dict | None = None,
    ) -> None:
        entry = AuditLog(
            user_id=user_id,
            organization_id=organization_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            metadata_json=json.dumps(metadata or {}),
        )
        db.add(entry)
        await db.flush()


audit_service = AuditService()
