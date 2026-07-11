"""When to retrieve documents and show citations in chat."""

import re

_DOCUMENT_QUERY_RE = re.compile(
    r"\b("
    r"pdf|pdfs|document|documents|docx|doc|file|files|upload|uploaded|attached|attachment|"
    r"resume|prd|specification|specifications|"
    r"summarize|summary|summarise|"
    r"what does (?:the|my|this|that) (?:pdf|document|file|upload|attachment) say|"
    r"check (?:the|my|this|that) (?:pdf|document|file|upload|attachment)|"
    r"review (?:the|my|this|that) (?:pdf|document|file|upload|attachment)|"
    r"read (?:the|my|this|that) (?:pdf|document|file|upload|attachment)|"
    r"from (?:the|my|this|that) (?:pdf|document|file|upload|attachment)"
    r")\b",
    re.IGNORECASE,
)


def user_requests_document_context(query: str) -> bool:
    """True when the user explicitly asks about uploaded files or PDFs."""
    return bool(_DOCUMENT_QUERY_RE.search(query or ""))


def should_use_document_rag(
    query: str,
    document_id: str | None = None,
    context_source=None,
    project_id: str | None = None,
) -> bool:
    """Only retrieve and cite documents when attached or explicitly requested."""
    if context_source is not None:
        from app.services.context_policy import should_use_document_rag as resolve_document_rag

        return resolve_document_rag(context_source, query, document_id, project_id)
    return bool(document_id) or user_requests_document_context(query)


def rag_context_preamble(show_citations: bool) -> str:
    if show_citations:
        return (
            "\n\nThe user asked about uploaded document content. "
            "Use the numbered excerpts below. Cite inline as [1], [2], etc. "
            "Do not add a separate References or Sources section.\n\n"
        )
    return "\n\nBackground context (do not cite or list references):\n\n"
