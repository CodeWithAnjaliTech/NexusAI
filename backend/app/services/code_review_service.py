"""Project zip extraction and AI-powered code review."""

import json
import re
import shutil
import tempfile
import time
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

from langchain_core.messages import HumanMessage, SystemMessage

from app.config import get_settings
from app.core.logging import logger
from app.services.code_review_levels import (
    DEFAULT_EXPERIENCE_LEVEL,
    ExperienceLevel,
    build_review_system_prompt,
    normalize_experience_level,
)
from app.services.llm import get_llm_service

SKIP_DIR_NAMES = {
    ".git",
    ".hg",
    ".svn",
    "node_modules",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".venv",
    "venv",
    "env",
    "dist",
    "build",
    ".next",
    "coverage",
    ".turbo",
    "target",
    "vendor",
    ".idea",
    ".vscode",
}

CODE_EXTENSIONS = {
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".go",
    ".rs",
    ".java",
    ".kt",
    ".cpp",
    ".c",
    ".h",
    ".cs",
    ".php",
    ".rb",
    ".swift",
    ".sql",
    ".css",
    ".scss",
    ".html",
    ".vue",
    ".svelte",
}

CONFIG_NAMES = {
    "package.json",
    "requirements.txt",
    "pyproject.toml",
    "Cargo.toml",
    "go.mod",
    "docker-compose.yml",
    "Dockerfile",
    "README.md",
    "readme.md",
    ".env.example",
    "tsconfig.json",
    "vite.config.ts",
    "render.yaml",
    "vercel.json",
}

SECRET_PATTERNS = [
    (r"(?i)(api[_-]?key|secret|password|token)\s*[:=]\s*['\"][^'\"]{8,}['\"]", "Possible hardcoded secret"),
    (r"sk-[a-zA-Z0-9]{20,}", "Possible OpenAI API key"),
    (r"ghp_[a-zA-Z0-9]{20,}", "Possible GitHub token"),
]

FRAMEWORK_HINTS = {
    "package.json": ["react", "next", "vite", "express", "vue"],
    "requirements.txt": ["fastapi", "django", "flask"],
    "pyproject.toml": ["fastapi", "django"],
    "go.mod": ["gin", "fiber"],
}


@dataclass
class ScannedFile:
    rel_path: str
    ext: str
    lines: int
    content: str = ""


@dataclass
class ScanResult:
    project_name: str
    files: list[ScannedFile] = field(default_factory=list)
    static_notes: list[str] = field(default_factory=list)

    @property
    def languages(self) -> list[str]:
        exts = sorted({f.ext.lstrip(".") for f in self.files if f.ext})
        return exts[:12]

    @property
    def code_file_count(self) -> int:
        return len(self.files)

    @property
    def total_lines(self) -> int:
        return sum(f.lines for f in self.files)


def _should_skip_path(parts: tuple[str, ...]) -> bool:
    return any(part in SKIP_DIR_NAMES for part in parts)


def safe_extract_zip(zip_bytes: bytes, dest: Path, max_uncompressed_mb: int) -> None:
    """Extract zip with zip-slip protection and size limit."""
    dest.mkdir(parents=True, exist_ok=True)
    max_bytes = max_uncompressed_mb * 1024 * 1024
    total = 0

    with zipfile.ZipFile(__import__("io").BytesIO(zip_bytes)) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            total += info.file_size
            if total > max_bytes:
                raise ValueError(f"Archive exceeds {max_uncompressed_mb}MB uncompressed limit")

            member_path = Path(info.filename)
            if member_path.is_absolute() or ".." in member_path.parts:
                raise ValueError("Unsafe path in archive")

            target = (dest / member_path).resolve()
            if not str(target).startswith(str(dest.resolve())):
                raise ValueError("Zip slip detected")

            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info) as src, open(target, "wb") as out:
                shutil.copyfileobj(src, out)


def scan_project(root: Path, max_files: int, max_file_chars: int) -> ScanResult:
    settings = get_settings()
    project_name = root.name
    if len(list(root.iterdir())) == 1 and list(root.iterdir())[0].is_dir():
        project_name = list(root.iterdir())[0].name
        root = list(root.iterdir())[0]

    files: list[ScannedFile] = []
    static_notes: list[str] = []
    all_paths: list[str] = []

    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(root)
        if _should_skip_path(rel.parts):
            continue
        all_paths.append(str(rel))
        if len(files) >= max_files:
            continue

        ext = path.suffix.lower()
        name = path.name.lower()
        is_code = ext in CODE_EXTENSIONS
        is_config = name in CONFIG_NAMES

        if not is_code and not is_config:
            continue

        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue

        if not text.strip():
            continue

        lines = text.count("\n") + 1
        preview = text[:max_file_chars]
        files.append(ScannedFile(rel_path=str(rel), ext=ext or name, lines=lines, content=preview))

        for pattern, label in SECRET_PATTERNS:
            if re.search(pattern, text):
                static_notes.append(f"{label} in `{rel}`")
                break

    todo_count = 0
    for sf in files:
        todo_count += len(re.findall(r"\b(TODO|FIXME|HACK|XXX)\b", sf.content, re.I))
    if todo_count:
        static_notes.append(f"Found {todo_count} TODO/FIXME markers across scanned files")

    has_readme = any("readme" in p.lower() for p in all_paths)
    if not has_readme:
        static_notes.append("No README found — add project documentation")

    has_tests = any("test" in p.lower() or "spec" in p.lower() for p in all_paths)
    if not has_tests:
        static_notes.append("No obvious test directory or spec files detected")

    if len(all_paths) > max_files:
        static_notes.append(f"Scanned first {max_files} of {len(all_paths)} eligible files")

    return ScanResult(project_name=project_name, files=files, static_notes=static_notes)


def _detect_frameworks(files: list[ScannedFile]) -> list[str]:
    found: list[str] = []
    for sf in files:
        base = Path(sf.rel_path).name.lower()
        if base not in FRAMEWORK_HINTS:
            continue
        lower = sf.content.lower()
        for hint in FRAMEWORK_HINTS[base]:
            if hint in lower and hint not in found:
                found.append(hint)
    return found


def _build_review_context(scan: ScanResult) -> str:
    settings = get_settings()
    max_context = settings.code_review_max_context_chars

    parts = [
        f"Project: {scan.project_name}",
        f"Files scanned: {scan.code_file_count}, Lines: {scan.total_lines}",
        f"Languages/extensions: {', '.join(scan.languages) or 'unknown'}",
        f"Framework hints: {', '.join(_detect_frameworks(scan.files)) or 'none detected'}",
        "",
        "Static analysis notes:",
        *([f"- {n}" for n in scan.static_notes] if scan.static_notes else ["- none"]),
        "",
        "File contents (truncated):",
    ]

    for sf in scan.files:
        block = f"\n--- {sf.rel_path} ({sf.lines} lines) ---\n{sf.content}\n"
        if sum(len(p) for p in parts) + len(block) > max_context:
            parts.append(f"\n... ({len(scan.files) - scan.files.index(sf)} more files omitted for context limit)")
            break
        parts.append(block)

    return "\n".join(parts)[:max_context]


REVIEW_SYSTEM_PROMPT = build_review_system_prompt(DEFAULT_EXPERIENCE_LEVEL)


def _coerce_text_items(items: list | None, *, limit: int = 8) -> list[str]:
    """Normalize LLM list fields that may be strings or objects."""
    result: list[str] = []
    for item in items or []:
        if isinstance(item, str):
            text = item.strip()
        elif isinstance(item, dict):
            title = item.get("name") or item.get("title") or item.get("priority")
            detail = (
                item.get("rationale")
                or item.get("description")
                or item.get("suggestion")
                or item.get("impact")
            )
            if title and detail:
                text = f"{title}: {detail}"
            elif title:
                text = str(title).strip()
            else:
                text = ", ".join(f"{k}: {v}" for k, v in item.items() if v)[:500]
        else:
            text = str(item).strip()
        if text:
            result.append(text)
        if len(result) >= limit:
            break
    return result


def _safe_int(value, default: int = 70, *, low: int = 0, high: int = 100) -> int:
    try:
        return min(high, max(low, int(value)))
    except (TypeError, ValueError):
        return default


def _parse_llm_json(raw: str) -> dict:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            return json.loads(match.group())
        raise


def _normalize_review(data: dict, scan: ScanResult) -> dict:
    categories = []
    for cat in data.get("categories", []):
        findings = []
        for f in cat.get("findings", []):
            sev = f.get("severity", "info")
            if sev not in ("critical", "high", "medium", "low", "info"):
                sev = "info"
            findings.append(
                {
                    "severity": sev,
                    "file": f.get("file"),
                    "line": f.get("line"),
                    "title": f.get("title", "Finding"),
                    "description": f.get("description", ""),
                    "suggestion": f.get("suggestion", ""),
                }
            )
        categories.append(
            {
                "name": cat.get("name", "General"),
                "score": min(100, max(0, int(cat.get("score", 70)))),
                "findings": findings,
            }
        )

    return {
        "overall_score": _safe_int(data.get("overall_score", 70)),
        "summary": str(data.get("summary") or "Review completed.").strip(),
        "strengths": _coerce_text_items(data.get("strengths")),
        "priorities": _coerce_text_items(data.get("priorities")),
        "categories": categories,
        "stats": {
            "file_count": scan.code_file_count,
            "code_files": scan.code_file_count,
            "total_lines": scan.total_lines,
            "languages": scan.languages,
            "frameworks": _detect_frameworks(scan.files),
        },
    }


def safe_write_project_files(
    entries: list[tuple[str, bytes]],
    dest: Path,
    max_total_mb: int,
    *,
    max_upload_files: int = 500,
) -> None:
    """Write uploaded relative paths into dest with zip-slip protection and size limits."""
    if len(entries) > max_upload_files:
        raise ValueError(f"Too many files ({len(entries)}). Upload at most {max_upload_files}.")

    dest.mkdir(parents=True, exist_ok=True)
    max_bytes = max_total_mb * 1024 * 1024
    total = 0

    for rel_path, content in entries:
        member_path = Path(rel_path.replace("\\", "/"))
        if member_path.is_absolute() or ".." in member_path.parts:
            raise ValueError("Unsafe path in upload")
        if _should_skip_path(member_path.parts):
            continue

        total += len(content)
        if total > max_bytes:
            raise ValueError(f"Upload exceeds {max_total_mb}MB total limit")

        target = (dest / member_path).resolve()
        if not str(target).startswith(str(dest.resolve())):
            raise ValueError("Path traversal detected")

        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)


def _empty_review_result(project_name: str, start: float, message: str) -> dict:
    return {
        "project_name": project_name,
        "stats": {
            "file_count": 0,
            "code_files": 0,
            "total_lines": 0,
            "languages": [],
            "frameworks": [],
        },
        "overall_score": 0,
        "summary": message,
        "strengths": [],
        "priorities": [
            "Upload source code only (exclude node_modules, .git, venv).",
            "Or use folder upload and pick your project root.",
        ],
        "categories": [],
        "duration_ms": int((time.perf_counter() - start) * 1000),
    }


def _run_review_on_scan(
    scan: ScanResult,
    project_name: str,
    start: float,
    experience_level: ExperienceLevel | str | None = None,
) -> dict:
    level = normalize_experience_level(experience_level)
    if not scan.files:
        result = _empty_review_result(
            scan.project_name or project_name,
            start,
            "No reviewable source files found. Include code or config files.",
        )
        result["experience_level"] = level
        return result

    context = _build_review_context(scan)
    llm = get_llm_service().get_chat_model(temperature=0.2)
    response = llm.invoke(
        [
            SystemMessage(content=build_review_system_prompt(level)),
            HumanMessage(
                content=(
                    f"Review this project archive for a {level}-level developer:\n\n{context}"
                )
            ),
        ]
    )
    raw = response.content if isinstance(response.content, str) else str(response.content)

    try:
        parsed = _parse_llm_json(raw)
        result = _normalize_review(parsed, scan)
    except (json.JSONDecodeError, ValueError, KeyError) as exc:
        logger.warning("Code review JSON parse failed: %s", exc)
        result = {
            "overall_score": 65,
            "summary": raw[:1500] if raw else "Review completed but response was not structured JSON.",
            "strengths": [],
            "priorities": ["Re-run review or check LLM model supports JSON output."],
            "categories": [
                {
                    "name": "General",
                    "score": 65,
                    "findings": [
                        {
                            "severity": "info",
                            "file": None,
                            "line": None,
                            "title": "Unstructured LLM response",
                            "description": raw[:800],
                            "suggestion": "Use OpenAI or a model with stronger JSON adherence.",
                        }
                    ],
                }
            ],
            "stats": {
                "file_count": scan.code_file_count,
                "code_files": scan.code_file_count,
                "total_lines": scan.total_lines,
                "languages": scan.languages,
                "frameworks": _detect_frameworks(scan.files),
            },
        }

    result["project_name"] = scan.project_name or project_name
    result["duration_ms"] = int((time.perf_counter() - start) * 1000)
    result["experience_level"] = level
    return result


def run_code_review_from_files_sync(
    entries: list[tuple[str, bytes]],
    project_name: str = "project",
    experience_level: ExperienceLevel | str | None = None,
) -> dict:
    """Write uploaded files to a temp tree, scan, and produce AI review report."""
    settings = get_settings()
    start = time.perf_counter()

    with tempfile.TemporaryDirectory(prefix="nexusai_review_") as tmp:
        extract_root = Path(tmp) / "extract"
        safe_write_project_files(
            entries,
            extract_root,
            settings.code_review_max_zip_mb,
        )
        scan = scan_project(
            extract_root,
            max_files=settings.code_review_max_files,
            max_file_chars=settings.code_review_max_file_chars,
        )

    return _run_review_on_scan(scan, project_name, start, experience_level)


def run_code_review_from_zip_bytes(
    zip_bytes: bytes,
    project_name: str,
    experience_level: ExperienceLevel | str | None = None,
) -> dict:
    """Extract zip archive, scan files, and produce AI review report."""
    settings = get_settings()
    start = time.perf_counter()

    with tempfile.TemporaryDirectory(prefix="nexusai_review_") as tmp:
        extract_root = Path(tmp) / "extract"
        safe_extract_zip(zip_bytes, extract_root, settings.code_review_max_zip_mb)
        scan = scan_project(
            extract_root,
            max_files=settings.code_review_max_files,
            max_file_chars=settings.code_review_max_file_chars,
        )

    return _run_review_on_scan(scan, project_name, start, experience_level)


def run_code_review_sync(
    zip_bytes: bytes,
    filename: str = "project.zip",
    experience_level: ExperienceLevel | str | None = None,
) -> dict:
    """Extract zip, scan files, and produce AI review report."""
    project_name = filename.replace(".zip", "")
    return run_code_review_from_zip_bytes(zip_bytes, project_name, experience_level)


def run_code_review_from_github_sync(
    repo_url: str,
    token: str | None,
    branch: str | None = None,
    experience_level: ExperienceLevel | str | None = None,
) -> dict:
    """Download a GitHub repo zipball server-side and run the code review pipeline."""
    from app.services.github_repo_fetch import (
        GitHubRepoError,
        fetch_repo_zipball,
        get_repo_metadata,
        parse_github_repo_url,
    )

    owner, repo = parse_github_repo_url(repo_url)
    meta = get_repo_metadata(owner, repo, token)
    ref = (branch or meta["default_branch"]).strip() or meta["default_branch"]
    project_name = meta["full_name"]

    settings = get_settings()
    max_download = max(settings.code_review_max_zip_mb, 100)
    zip_bytes = fetch_repo_zipball(owner, repo, ref, token, max_download_mb=max_download)

    result = run_code_review_from_zip_bytes(zip_bytes, project_name, experience_level)
    result["project_name"] = project_name
    result["review_source"] = {
        "type": "github",
        "repo_url": f"https://github.com/{owner}/{repo}",
        "branch": ref,
        "full_name": project_name,
    }
    return result
