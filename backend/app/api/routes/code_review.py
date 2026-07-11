"""Code review API — upload project zip, folder, or GitHub repo for AI analysis."""

import asyncio
import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.api.deps import require_auth
from app.config import get_settings
from app.db.models.user import User
from app.schemas.code_review import (
    CodeReviewResponse,
    ExperienceLevel,
    GitHubReviewRequest,
    GitHubReviewSourcesResponse,
)
from app.services.code_review_levels import normalize_experience_level
from app.services.code_review_service import (
    run_code_review_from_files_sync,
    run_code_review_from_github_sync,
    run_code_review_sync,
)
from app.services.github_repo_fetch import (
    GitHubRepoError,
    get_repo_metadata,
    list_repo_branches,
    normalize_github_repo_url,
    parse_github_repo_url,
)
from app.services.user_preferences import get_github_settings

router = APIRouter(prefix="/code-review", tags=["code-review"])
settings = get_settings()


@router.get("/github-sources", response_model=GitHubReviewSourcesResponse)
async def github_review_sources(
    user: User = Depends(require_auth),
    repo_url: str | None = None,
) -> GitHubReviewSourcesResponse:
    """Return connected GitHub repo info and branches for the code review UI."""
    gh = get_github_settings(user)
    target_url = repo_url or gh.get("repo_url")
    token = gh.get("token")
    connected = bool(gh.get("connected")) or bool(token)

    if not target_url:
        return GitHubReviewSourcesResponse(connected=connected)

    try:
        normalized_url = normalize_github_repo_url(target_url)
        owner, repo = parse_github_repo_url(normalized_url)
    except GitHubRepoError as exc:
        return GitHubReviewSourcesResponse(
            connected=connected,
            repo_url=target_url,
            default_branch="main",
            username=gh.get("username"),
            error=str(exc),
        )

    try:
        meta = await asyncio.to_thread(get_repo_metadata, owner, repo, token)
        branches = await asyncio.to_thread(list_repo_branches, owner, repo, token)
        default = meta["default_branch"]
        if default not in branches and default:
            branches = [default, *branches]
        return GitHubReviewSourcesResponse(
            connected=connected,
            repo_url=normalized_url,
            repo_full_name=meta["full_name"],
            default_branch=default,
            branches=branches[:20],
            username=gh.get("username"),
        )
    except GitHubRepoError as exc:
        return GitHubReviewSourcesResponse(
            connected=connected,
            repo_url=normalized_url,
            repo_full_name=f"{owner}/{repo}",
            default_branch="main",
            branches=[],
            username=gh.get("username"),
            error=str(exc),
        )


@router.post("/analyze-github", response_model=CodeReviewResponse)
async def analyze_github_repo(
    body: GitHubReviewRequest,
    user: User = Depends(require_auth),
) -> CodeReviewResponse:
    """Download repository from GitHub server-side and run AI code review."""
    gh = get_github_settings(user)
    repo_url = (body.repo_url or gh.get("repo_url") or "").strip()
    token = gh.get("token")

    if not repo_url:
        raise HTTPException(
            status_code=400,
            detail="No repository URL. Connect GitHub in Settings or provide repo_url.",
        )
    if not token:
        raise HTTPException(
            status_code=400,
            detail="GitHub token required. Connect GitHub in Settings with a personal access token.",
        )

    try:
        repo_url = normalize_github_repo_url(repo_url)
    except GitHubRepoError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        result = await asyncio.to_thread(
            run_code_review_from_github_sync,
            repo_url,
            token,
            body.branch,
            body.experience_level,
        )
    except GitHubRepoError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Code review failed: {exc}") from exc

    return CodeReviewResponse(**result)


@router.post("/analyze", response_model=CodeReviewResponse)
async def analyze_project_zip(
    file: UploadFile = File(...),
    experience_level: ExperienceLevel = Form("intermediate"),
    user: User = Depends(require_auth),
) -> CodeReviewResponse:
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Upload a .zip archive of your project")

    content = await file.read()
    max_bytes = settings.code_review_max_zip_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Zip exceeds {settings.code_review_max_zip_mb}MB limit",
        )

    try:
        result = await asyncio.to_thread(
            run_code_review_sync,
            content,
            file.filename,
            normalize_experience_level(experience_level),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Code review failed: {exc}") from exc

    return CodeReviewResponse(**result)


@router.post("/analyze-folder", response_model=CodeReviewResponse)
async def analyze_project_folder(
    files: list[UploadFile] = File(...),
    paths: str = Form(...),
    project_name: str = Form("project"),
    experience_level: ExperienceLevel = Form("intermediate"),
    user: User = Depends(require_auth),
) -> CodeReviewResponse:
    """Upload a project folder (source files only) — avoids bloated zip archives."""
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    try:
        path_list = json.loads(paths)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid paths JSON") from exc

    if not isinstance(path_list, list) or len(path_list) != len(files):
        raise HTTPException(status_code=400, detail="File count must match paths list")

    entries: list[tuple[str, bytes]] = []
    max_bytes = settings.code_review_max_zip_mb * 1024 * 1024
    total = 0

    for upload, rel_path in zip(files, path_list):
        if not isinstance(rel_path, str) or not rel_path.strip():
            raise HTTPException(status_code=400, detail="Each path must be a non-empty string")
        content = await upload.read()
        total += len(content)
        if total > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"Upload exceeds {settings.code_review_max_zip_mb}MB total limit",
            )
        entries.append((rel_path, content))

    try:
        result = await asyncio.to_thread(
            run_code_review_from_files_sync,
            entries,
            project_name,
            normalize_experience_level(experience_level),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Code review failed: {exc}") from exc

    return CodeReviewResponse(**result)
