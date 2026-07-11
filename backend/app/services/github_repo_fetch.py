"""Fetch GitHub repository archives for code review."""

import re

import httpx

from app.core.logging import logger

_GITHUB_API = "https://api.github.com"
_REPO_URL_RE = re.compile(r"github\.com[/:]([^/]+)/([^/.]+)")
_OWNER_REPO_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")


class GitHubRepoError(ValueError):
    """Raised when a GitHub repository cannot be fetched."""


def normalize_github_repo_url(repo_url: str) -> str:
    """Accept full GitHub URLs or owner/repo shorthand."""
    raw = repo_url.strip().rstrip("/")
    if not raw:
        raise GitHubRepoError("Repository URL is required.")

    if _OWNER_REPO_RE.fullmatch(raw):
        return f"https://github.com/{raw}"

    if _REPO_URL_RE.search(raw):
        return raw

    if "/" not in raw and "github.com" not in raw.lower():
        raise GitHubRepoError(
            f"'{raw}' looks like a username only. Use owner/repo (e.g. {raw}/cashflow-tracker)."
        )

    raise GitHubRepoError(
        "Invalid GitHub repository URL. Use https://github.com/owner/repo or owner/repo."
    )


def parse_github_repo_url(repo_url: str) -> tuple[str, str]:
    normalized = normalize_github_repo_url(repo_url)
    match = _REPO_URL_RE.search(normalized)
    if not match:
        raise GitHubRepoError("Invalid GitHub repository URL.")
    return match.group(1), match.group(2)


def github_api_headers(token: str | None = None) -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def get_repo_metadata(owner: str, repo: str, token: str | None = None) -> dict:
    """Return repository metadata including default_branch."""
    url = f"{_GITHUB_API}/repos/{owner}/{repo}"
    try:
        with httpx.Client(timeout=20) as client:
            resp = client.get(url, headers=github_api_headers(token))
    except httpx.HTTPError as exc:
        raise GitHubRepoError(f"Could not reach GitHub: {exc}") from exc

    if resp.status_code == 404:
        raise GitHubRepoError("Repository not found or token lacks access.")
    if resp.status_code == 401:
        raise GitHubRepoError("Invalid or expired GitHub token.")
    if resp.status_code != 200:
        raise GitHubRepoError(f"GitHub API error ({resp.status_code}).")

    data = resp.json()
    return {
        "full_name": data.get("full_name", f"{owner}/{repo}"),
        "default_branch": data.get("default_branch") or "main",
        "description": data.get("description"),
        "language": data.get("language"),
        "private": data.get("private", False),
    }


def list_repo_branches(owner: str, repo: str, token: str | None = None, limit: int = 20) -> list[str]:
    """Return branch names for the repository."""
    url = f"{_GITHUB_API}/repos/{owner}/{repo}/branches"
    params = {"per_page": min(limit, 100)}
    try:
        with httpx.Client(timeout=20) as client:
            resp = client.get(url, headers=github_api_headers(token), params=params)
    except httpx.HTTPError as exc:
        logger.warning("Failed to list branches: %s", exc)
        return []

    if resp.status_code != 200:
        return []

    return [item.get("name", "") for item in resp.json() if item.get("name")][:limit]


def fetch_repo_zipball(
    owner: str,
    repo: str,
    ref: str,
    token: str | None = None,
    *,
    max_download_mb: int = 100,
) -> bytes:
    """Download repository source archive for a branch, tag, or commit ref."""
    url = f"{_GITHUB_API}/repos/{owner}/{repo}/zipball/{ref}"
    max_bytes = max_download_mb * 1024 * 1024

    try:
        with httpx.Client(timeout=120, follow_redirects=True) as client:
            with client.stream("GET", url, headers=github_api_headers(token)) as resp:
                if resp.status_code == 404:
                    raise GitHubRepoError(f"Branch or ref '{ref}' not found.")
                if resp.status_code == 401:
                    raise GitHubRepoError("Invalid or expired GitHub token.")
                if resp.status_code != 200:
                    raise GitHubRepoError(f"Could not download repository ({resp.status_code}).")

                chunks: list[bytes] = []
                total = 0
                for chunk in resp.iter_bytes():
                    total += len(chunk)
                    if total > max_bytes:
                        raise GitHubRepoError(
                            f"Repository archive exceeds {max_download_mb}MB download limit."
                        )
                    chunks.append(chunk)
    except httpx.HTTPError as exc:
        raise GitHubRepoError(f"Could not download repository: {exc}") from exc

    return b"".join(chunks)
