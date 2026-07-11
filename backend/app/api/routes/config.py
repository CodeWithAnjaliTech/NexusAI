"""LLM configuration and user model preferences."""

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_auth
from app.db.models.user import User
from app.db.session import get_db
from app.services.llm import get_llm_service
from app.services.user_preferences import set_llm_preferences

router = APIRouter(prefix="/config", tags=["config"])


class LlmPreferenceUpdate(BaseModel):
    provider: Literal["ollama", "openai", "anthropic"] | None = None
    model: str | None = Field(default=None, max_length=128)


@router.get("/llm")
async def get_llm_config(user: User = Depends(require_auth)):
    return get_llm_service().provider_info(user)


@router.patch("/llm")
async def update_llm_config(
    body: LlmPreferenceUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
):
    set_llm_preferences(user, body.provider, body.model)
    await db.flush()
    return get_llm_service().provider_info(user)
