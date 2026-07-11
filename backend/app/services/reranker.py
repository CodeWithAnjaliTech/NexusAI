"""Re-rank retrieved documents for improved RAG precision."""

from functools import lru_cache
from typing import Any

from app.core.logging import logger


class RerankerService:
    """Cross-encoder reranking over initial vector search results."""

    def __init__(self) -> None:
        self._model = None

    def _get_model(self):
        if self._model is None:
            try:
                from sentence_transformers import CrossEncoder

                self._model = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
            except Exception as exc:
                logger.warning("CrossEncoder unavailable: %s", exc)
        return self._model

    def rerank(self, query: str, documents: list[dict[str, Any]], top_k: int = 5) -> list[dict[str, Any]]:
        if not documents:
            return []

        model = self._get_model()
        if model is None:
            return documents[:top_k]

        pairs = [(query, doc.get("content", "")) for doc in documents]
        try:
            scores = model.predict(pairs)
            ranked = sorted(
                zip(documents, scores, strict=False),
                key=lambda x: float(x[1]),
                reverse=True,
            )
            results = []
            for doc, score in ranked[:top_k]:
                enriched = {**doc, "rerank_score": float(score)}
                results.append(enriched)
            return results
        except Exception as exc:
            logger.warning("Reranking failed: %s", exc)
            return documents[:top_k]


@lru_cache
def get_reranker() -> RerankerService:
    return RerankerService()
