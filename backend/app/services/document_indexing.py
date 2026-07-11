"""Shared document indexing for upload and re-index."""

from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import logger
from app.db.models.document import Document
from app.db.models.embedding import Embedding
from app.services.file_processor import file_processor
from app.services.vector_store import get_vector_store


async def clear_document_embeddings(db: AsyncSession, document: Document) -> list[str]:
    """Remove Chroma vectors and DB embedding rows for a document."""
    result = await db.execute(select(Embedding).where(Embedding.document_id == document.id))
    rows = list(result.scalars().all())
    chroma_ids = [r.chroma_id for r in rows]
    if chroma_ids:
        vector_store = get_vector_store()
        if vector_store:
            vector_store.delete_ids(chroma_ids)
        await db.execute(delete(Embedding).where(Embedding.document_id == document.id))
    return chroma_ids


async def index_document(db: AsyncSession, document: Document) -> None:
    """Extract text, chunk, and index into ChromaDB."""
    file_path = Path(document.file_path)
    if not file_path.is_file():
        raise FileNotFoundError(f"File not found: {document.filename}")

    document.status = "processing"
    await db.flush()

    text = file_processor.extract_text(file_path, document.mime_type)
    chunks = file_processor.chunk_text(text)
    vector_store = get_vector_store()

    if vector_store is None or not chunks:
        document.status = "stored" if chunks else "failed"
        document.chunk_count = len(chunks)
        await db.flush()
        return

    chroma_ids = vector_store.add_documents(
        texts=chunks,
        metadatas=[
            {
                "document_id": str(document.id),
                "filename": document.filename,
                "chunk_index": i,
                **({"project_id": str(document.project_id)} if document.project_id else {}),
            }
            for i in range(len(chunks))
        ],
    )

    for i, chroma_id in enumerate(chroma_ids):
        db.add(
            Embedding(
                document_id=document.id,
                chroma_id=chroma_id,
                chunk_index=i,
                content_preview=chunks[i][:200] if i < len(chunks) else None,
            )
        )

    document.status = "indexed"
    document.chunk_count = len(chunks)
    await db.flush()
    logger.info("Indexed document %s (%d chunks)", document.filename, len(chunks))


async def reindex_document(db: AsyncSession, document: Document) -> None:
    """Clear old vectors and re-index from disk."""
    await clear_document_embeddings(db, document)
    await index_document(db, document)
