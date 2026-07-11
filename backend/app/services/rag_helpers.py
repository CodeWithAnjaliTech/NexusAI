"""Fetch RAG citations and document context for chat responses."""

from pathlib import Path
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.logging import logger
from app.db.models.document import Document
from app.db.models.embedding import Embedding
from app.services.file_processor import file_processor
from app.services.reranker import get_reranker
from app.services.rag_policy import rag_context_preamble, should_use_document_rag
from app.services.vector_store import get_vector_store

_ATTACHMENT_QUERY = (
    "document content summary requirements specifications sections tables achievements rewards"
)


def _format_rag_context(results: list[dict]) -> tuple[str, list[dict]]:
    """Build LLM context block and citation list from retrieved docs."""
    citations: list[dict] = []
    blocks: list[str] = []
    for i, doc in enumerate(results, start=1):
        meta = doc.get("metadata") or {}
        filename = meta.get("filename", "document")
        cite_id = f"[{i}]"
        citations.append(
            {
                "id": cite_id,
                "source": filename,
                "content": doc.get("content", "")[:300],
                "score": doc.get("rerank_score") or doc.get("score"),
                "chunk_index": meta.get("chunk_index"),
                "document_id": meta.get("document_id"),
            }
        )
        blocks.append(f"{cite_id} ({filename}):\n{doc.get('content', '')[:800]}")
    return "\n\n---\n".join(blocks), citations


def _search_vector_store(
    query: str,
    document_id: str | None = None,
    project_id: str | None = None,
) -> list[dict]:
    settings = get_settings()
    fetch_k = settings.rag_fetch_k if settings.rag_rerank_enabled else settings.rag_top_k
    vector_store = get_vector_store()
    if not vector_store:
        return []

    results = vector_store.search(
        query,
        n_results=fetch_k,
        document_id=document_id,
        project_id=project_id,
    )
    if settings.rag_rerank_enabled and results:
        results = get_reranker().rerank(query, results, top_k=settings.rag_top_k)
    return results


def fetch_rag_citations(
    query: str,
    document_id: str | None = None,
    project_id: str | None = None,
) -> list[dict]:
    try:
        results = _search_vector_store(query, document_id, project_id)
        if not results and document_id:
            results = _search_vector_store(_ATTACHMENT_QUERY, document_id, project_id)
        if results:
            _, citations = _format_rag_context(results)
            return citations
    except Exception as exc:
        logger.warning("RAG citation fetch failed: %s", exc)
    return []


async def _load_chunks_from_db(db: AsyncSession, document_id: str) -> list[dict]:
    doc_uuid = UUID(document_id)
    doc_result = await db.execute(select(Document).where(Document.id == doc_uuid))
    document = doc_result.scalar_one_or_none()
    if not document:
        return []

    file_path = Path(document.file_path)
    if file_path.is_file():
        text = file_processor.extract_text(file_path, document.mime_type)
        chunks = file_processor.chunk_text(text)
        if chunks:
            settings = get_settings()
            return [
                {
                    "id": f"{document_id}-{i}",
                    "content": chunk,
                    "metadata": {
                        "document_id": document_id,
                        "filename": document.filename,
                        "chunk_index": i,
                    },
                    "score": 1.0,
                }
                for i, chunk in enumerate(chunks[: settings.rag_top_k])
            ]

    emb_result = await db.execute(
        select(Embedding)
        .where(Embedding.document_id == doc_uuid)
        .order_by(Embedding.chunk_index)
    )
    rows = list(emb_result.scalars().all())
    if not rows:
        return []

    return [
        {
            "id": row.chroma_id,
            "content": row.content_preview or "",
            "metadata": {
                "document_id": document_id,
                "filename": document.filename,
                "chunk_index": row.chunk_index,
            },
            "score": 1.0,
        }
        for row in rows
        if row.content_preview
    ]


async def build_rag_context(
    db: AsyncSession | None,
    query: str,
    *,
    document_id: str | None = None,
    project_id: str | None = None,
) -> tuple[str, list[dict]]:
    """Build LLM context block and citations from vector search with DB/file fallback."""
    try:
        results = _search_vector_store(query, document_id, project_id)
        if not results and document_id:
            results = _search_vector_store(_ATTACHMENT_QUERY, document_id, project_id)

        if not results and document_id and db is not None:
            results = await _load_chunks_from_db(db, document_id)

        if results:
            formatted, citations = _format_rag_context(results)
            show_citations = should_use_document_rag(query, document_id)
            context_block = rag_context_preamble(show_citations) + formatted
            if not show_citations:
                citations = []
            return context_block, citations
    except Exception as exc:
        logger.warning("RAG context build failed: %s", exc)
    return "", []
