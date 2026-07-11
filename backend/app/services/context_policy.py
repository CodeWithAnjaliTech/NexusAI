"""Explicit chat context source: GitHub repo vs Knowledge documents."""

from app.schemas.chat import ContextSource
from app.services.rag_policy import user_requests_document_context

_GITHUB_KEYWORDS = ("github", "repository", "repo")


def normalize_context_source(context_source: ContextSource | str | None) -> ContextSource:
    if context_source is None:
        return ContextSource.AUTO
    if isinstance(context_source, ContextSource):
        return context_source
    try:
        return ContextSource(context_source)
    except ValueError:
        return ContextSource.AUTO


def should_use_github(
    context_source: ContextSource | str | None,
    github_repo_url: str | None,
    query: str,
) -> bool:
    if not github_repo_url:
        return False
    source = normalize_context_source(context_source)
    if source in (ContextSource.NONE, ContextSource.DOCUMENT):
        return False
    if source in (ContextSource.GITHUB, ContextSource.BOTH):
        return True
    q = (query or "").lower()
    return any(keyword in q for keyword in _GITHUB_KEYWORDS)


def should_use_document_rag(
    context_source: ContextSource | str | None,
    query: str,
    document_id: str | None = None,
    project_id: str | None = None,
) -> bool:
    source = normalize_context_source(context_source)
    if source == ContextSource.NONE or source == ContextSource.GITHUB:
        return False
    if source == ContextSource.DOCUMENT:
        return bool(document_id)
    if source == ContextSource.BOTH:
        return bool(document_id)
    return bool(document_id) or user_requests_document_context(query)


def should_show_document_citations(
    context_source: ContextSource | str | None,
    query: str,
    document_id: str | None = None,
) -> bool:
    source = normalize_context_source(context_source)
    if source in (ContextSource.DOCUMENT, ContextSource.BOTH):
        return bool(document_id)
    if source == ContextSource.AUTO:
        return bool(document_id) or user_requests_document_context(query)
    return False
