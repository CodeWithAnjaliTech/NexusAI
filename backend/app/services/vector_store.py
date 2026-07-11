"""ChromaDB vector store service."""

import concurrent.futures
import time
from typing import Any
from uuid import uuid4

import chromadb
import httpx
from chromadb.config import Settings as ChromaSettings

from app.config import Settings, get_settings
from app.core.logging import logger
from app.services.llm import LLMService, get_llm_service

_vector_store: "VectorStoreService | None" = None
_chroma_unavailable_until: float = 0.0
_CHROMA_TIMEOUT_SECONDS = 5
_CHROMA_RETRY_SECONDS = 60


def chroma_is_reachable(settings: Settings | None = None) -> bool:
    """Check whether ChromaDB responds to heartbeat without mutating the cached client."""
    cfg = settings or get_settings()
    try:
        url = f"http://{cfg.chroma_host}:{cfg.chroma_port}/api/v1/heartbeat"
        response = httpx.get(url, timeout=_CHROMA_TIMEOUT_SECONDS)
        return response.status_code == 200
    except Exception as exc:
        logger.warning("ChromaDB heartbeat failed: %s", exc)
        return False


class VectorStoreService:
    """Manages document embeddings in ChromaDB."""

    def __init__(self, settings: Settings, llm_service: LLMService) -> None:
        self._settings = settings
        self._llm = llm_service
        self._client = chromadb.HttpClient(
            host=settings.chroma_host,
            port=settings.chroma_port,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        self._collection = self._client.get_or_create_collection(
            name=settings.chroma_collection,
            metadata={"hnsw:space": "cosine"},
        )

    def add_documents(
        self,
        texts: list[str],
        metadatas: list[dict[str, Any]] | None = None,
        ids: list[str] | None = None,
    ) -> list[str]:
        if not texts:
            return []

        doc_ids = ids or [str(uuid4()) for _ in texts]
        metas = metadatas or [{} for _ in texts]

        try:
            embeddings = self._llm.get_embeddings().embed_documents(texts)
            self._collection.add(
                ids=doc_ids,
                documents=texts,
                embeddings=embeddings,
                metadatas=metas,
            )
            logger.info("Added %d documents to ChromaDB", len(texts))
            return doc_ids
        except Exception as exc:
            logger.warning("Embedding failed, storing without vectors: %s", exc)
            self._collection.add(ids=doc_ids, documents=texts, metadatas=metas)
            return doc_ids

    def search(
        self,
        query: str,
        n_results: int = 5,
        document_id: str | None = None,
        project_id: str | None = None,
    ) -> list[dict[str, Any]]:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(
                self._search_sync,
                query,
                n_results,
                document_id,
                project_id,
            )
            try:
                return future.result(timeout=_CHROMA_TIMEOUT_SECONDS)
            except concurrent.futures.TimeoutError:
                logger.warning("ChromaDB search timed out after %ss", _CHROMA_TIMEOUT_SECONDS)
                return []
            except Exception as exc:
                logger.warning("ChromaDB search failed: %s", exc)
                return []

    def _search_sync(
        self,
        query: str,
        n_results: int,
        document_id: str | None,
        project_id: str | None,
    ) -> list[dict[str, Any]]:
        where_filter: dict[str, str] | None = None
        if document_id:
            where_filter = {"document_id": document_id}
        elif project_id:
            where_filter = {"project_id": project_id}
        try:
            query_embedding = self._llm.get_embeddings().embed_query(query)
            kwargs: dict[str, Any] = {
                "query_embeddings": [query_embedding],
                "n_results": n_results,
                "include": ["documents", "metadatas", "distances"],
            }
            if where_filter:
                kwargs["where"] = where_filter
            results = self._collection.query(**kwargs)
        except Exception as exc:
            logger.warning("Embedding search failed, using text query: %s", exc)
            kwargs = {
                "query_texts": [query],
                "n_results": n_results,
                "include": ["documents", "metadatas", "distances"],
            }
            if where_filter:
                kwargs["where"] = where_filter
            results = self._collection.query(**kwargs)

        items: list[dict[str, Any]] = []
        if not results["ids"] or not results["ids"][0]:
            return items

        for idx, doc_id in enumerate(results["ids"][0]):
            distance = results["distances"][0][idx] if results["distances"] else 1.0
            items.append(
                {
                    "id": doc_id,
                    "content": results["documents"][0][idx] if results["documents"] else "",
                    "metadata": results["metadatas"][0][idx] if results["metadatas"] else {},
                    "score": 1.0 - distance,
                }
            )
        return items

    def delete_ids(self, ids: list[str]) -> None:
        if ids:
            self._collection.delete(ids=ids)
            logger.info("Deleted %d vectors from ChromaDB", len(ids))


def get_vector_store() -> VectorStoreService | None:
    """Return ChromaDB client or None if the server is unavailable."""
    global _vector_store, _chroma_unavailable_until

    now = time.monotonic()
    if now < _chroma_unavailable_until:
        return None
    if _vector_store is not None:
        return _vector_store

    try:
        if not chroma_is_reachable():
            _chroma_unavailable_until = now + _CHROMA_RETRY_SECONDS
            return None
        _vector_store = VectorStoreService(get_settings(), get_llm_service())
        _chroma_unavailable_until = 0.0
        return _vector_store
    except Exception as exc:
        logger.warning("ChromaDB unavailable (check server version matches client 0.5.x): %s", exc)
        _chroma_unavailable_until = now + _CHROMA_RETRY_SECONDS
        return None
