"""GitHub tool — fetch repository structure and key files."""

import json
import re

import httpx

from app.core.logging import logger


def _parse_repo_url(repo_url: str) -> tuple[str, str] | None:
    match = re.search(r"github\.com[/:]([^/]+)/([^/.]+)", repo_url)
    if match:
        return match.group(1), match.group(2)
    return None


def repo_display_name(repo_url: str) -> str:
    parsed = _parse_repo_url(repo_url)
    if parsed:
        return f"{parsed[0]}/{parsed[1]}"
    return repo_url or "repository"


def fetch_repo_context(repo_url: str, token: str | None = None, max_files: int = 12) -> str:
    """Return a concise repo tree + README snippet for the LLM."""
    parsed = _parse_repo_url(repo_url)
    if not parsed:
        return "Invalid GitHub repository URL."

    owner, repo = parsed
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        with httpx.Client(timeout=12) as client:
            meta_resp = client.get(f"https://api.github.com/repos/{owner}/{repo}", headers=headers)
            if meta_resp.status_code != 200:
                return f"Could not access repository ({meta_resp.status_code})."

            meta = meta_resp.json()
            tree_resp = client.get(
                f"https://api.github.com/repos/{owner}/{repo}/git/trees/{meta['default_branch']}?recursive=1",
                headers=headers,
            )
            paths: list[str] = []
            if tree_resp.status_code == 200:
                for item in tree_resp.json().get("tree", []):
                    path = item.get("path", "")
                    if any(skip in path for skip in ("node_modules", ".git", "dist/", "build/")):
                        continue
                    if item.get("type") == "blob" and len(paths) < max_files:
                        paths.append(path)

            readme = ""
            readme_resp = client.get(
                f"https://api.github.com/repos/{owner}/{repo}/readme",
                headers={**headers, "Accept": "application/vnd.github.raw"},
            )
            if readme_resp.status_code == 200:
                readme = readme_resp.text[:1500]

        return json.dumps(
            {
                "repository": f"{owner}/{repo}",
                "description": meta.get("description"),
                "language": meta.get("language"),
                "stars": meta.get("stargazers_count"),
                "sample_paths": paths[:max_files],
                "readme_excerpt": readme,
            },
            indent=2,
        )
    except Exception as exc:
        logger.warning("GitHub tool failed: %s", exc)
        return f"GitHub fetch failed: {exc}"
