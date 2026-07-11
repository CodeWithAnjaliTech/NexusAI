"""Vector store availability checks."""

from unittest.mock import patch

from app.services import vector_store


def test_get_vector_store_retries_after_cooldown(monkeypatch):
    vector_store._vector_store = None
    vector_store._chroma_unavailable_until = 0.0

    with patch.object(vector_store, "chroma_is_reachable", return_value=False):
        assert vector_store.get_vector_store() is None
        assert vector_store._chroma_unavailable_until > 0

    monkeypatch.setattr(vector_store, "_chroma_unavailable_until", 0.0)

    sentinel = object()
    with patch.object(vector_store, "chroma_is_reachable", return_value=True), patch.object(
        vector_store, "VectorStoreService", return_value=sentinel
    ):
        assert vector_store.get_vector_store() is sentinel

    vector_store._vector_store = None
    vector_store._chroma_unavailable_until = 0.0
