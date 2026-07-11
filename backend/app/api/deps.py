"""FastAPI dependency injection helpers."""

import json
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.agent import Agent
from app.db.models.user import User
from app.db.session import get_db
from app.services.auth_service import decode_token, get_or_create_default_org, get_user_by_id

DEFAULT_AGENTS = [
    {
        "agent_key": "code_sandbox",
        "name": "Code Sandbox Agent",
        "description": "Debug, analyze, and execute Python code in a Docker-isolated sandbox.",
        "capabilities": ["debugging", "code execution", "stack trace analysis", "test generation"],
    },
    {
        "agent_key": "blueprint",
        "name": "Blueprint & Spec Agent",
        "description": "Analyze engineering standards, specifications, blueprints, and compliance documents.",
        "capabilities": ["standard lookup", "requirement extraction", "compliance checking", "citation generation"],
    },
    {
        "agent_key": "documentation",
        "name": "Documentation Agent",
        "description": "Answer questions from uploaded technical documents using RAG retrieval.",
        "capabilities": ["RAG retrieval", "cross-document analysis", "citations"],
    },
    {
        "agent_key": "research",
        "name": "Research Agent",
        "description": "Perform structured reasoning, comparison, risk analysis, and decision support.",
        "capabilities": ["multi-step reasoning", "summarization", "comparison", "risk analysis"],
    },
    {
        "agent_key": "general",
        "name": "General Specialist",
        "description": "Handle everyday questions, productivity help, and general assistance.",
        "capabilities": ["general assistance", "explanations", "learning support"],
    },
]

_bearer = HTTPBearer(auto_error=False)


async def get_or_create_default_user(db: AsyncSession) -> User:
    result = await db.execute(select(User).where(User.email == "demo@nexusai.local"))
    user = result.scalar_one_or_none()
    if user:
        if not user.organization_id:
            org = await get_or_create_default_org(db)
            user.organization_id = org.id
            await db.flush()
        return user

    org = await get_or_create_default_org(db)
    user = User(
        email="demo@nexusai.local",
        display_name="Demo User",
        preferences="{}",
        organization_id=org.id,
        role="member",
    )
    db.add(user)
    await db.flush()
    return user


async def get_current_user(
    db: AsyncSession = Depends(get_db),
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> User:
    if credentials:
        payload = decode_token(credentials.credentials)
        if payload and payload.get("sub"):
            user = await get_user_by_id(db, UUID(payload["sub"]))
            if user:
                return user

    return await get_or_create_default_user(db)


async def require_auth(
    db: AsyncSession = Depends(get_db),
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    if not payload or not payload.get("sub"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = await get_user_by_id(db, UUID(payload["sub"]))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


async def seed_agents(db: AsyncSession) -> None:
    for agent_data in DEFAULT_AGENTS:
        result = await db.execute(select(Agent).where(Agent.agent_key == agent_data["agent_key"]))
        if result.scalar_one_or_none():
            continue
        db.add(
            Agent(
                agent_key=agent_data["agent_key"],
                name=agent_data["name"],
                description=agent_data["description"],
                capabilities=json.dumps(agent_data["capabilities"]),
                status="active",
            )
        )
    await db.flush()


async def seed_default_organization(db: AsyncSession) -> None:
    await get_or_create_default_org(db)
