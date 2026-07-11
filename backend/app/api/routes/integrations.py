"""GitHub integration settings."""

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_auth
from app.db.models.user import User
from app.db.session import get_db
from app.services.github_repo_fetch import GitHubRepoError, normalize_github_repo_url
from app.services.user_preferences import get_github_settings, set_github_settings

router = APIRouter(prefix="/integrations/github", tags=["integrations"])


class GitHubSettings(BaseModel):
    connected: bool = False
    username: str | None = None
    repo_url: str | None = None


class GitHubConnectRequest(BaseModel):
    token: str
    repo_url: str | None = None


@router.get("", response_model=GitHubSettings)
async def get_github_settings_route(
    user: User = Depends(require_auth),
) -> GitHubSettings:
    gh = get_github_settings(user)
    return GitHubSettings(
        connected=bool(gh.get("connected")),
        username=gh.get("username"),
        repo_url=gh.get("repo_url"),
    )


@router.post("/connect", response_model=GitHubSettings)
async def connect_github(
    body: GitHubConnectRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
) -> GitHubSettings:
    username = user.display_name
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.github.com/user",
                headers={
                    "Authorization": f"Bearer {body.token}",
                    "Accept": "application/vnd.github+json",
                },
            )
        if resp.status_code == 200:
            username = resp.json().get("login", username)
        elif resp.status_code == 401:
            raise HTTPException(status_code=401, detail="Invalid GitHub token")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach GitHub: {exc}") from exc

    stored_repo_url = body.repo_url
    if stored_repo_url:
        try:
            stored_repo_url = normalize_github_repo_url(stored_repo_url)
        except GitHubRepoError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    set_github_settings(
        user,
        {
            "connected": True,
            "username": username,
            "repo_url": stored_repo_url,
            "token": body.token,
        },
    )
    await db.flush()
    return GitHubSettings(connected=True, username=username, repo_url=stored_repo_url)


@router.post("/disconnect", response_model=GitHubSettings)
async def disconnect_github(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
) -> GitHubSettings:
    set_github_settings(user, {"connected": False, "username": None, "repo_url": None, "token": None})
    await db.flush()
    return GitHubSettings(connected=False)
