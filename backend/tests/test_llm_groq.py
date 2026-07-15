"""LLM provider configuration tests."""

from app.config import Settings
from app.services.llm import LLMService


def test_groq_provider_info_when_configured():
    settings = Settings(
        llm_provider="groq",
        groq_api_key="gsk_test_key",
        groq_model="llama-3.3-70b-versatile",
    )
    info = LLMService(settings).provider_info()

    assert info["provider"] == "groq"
    assert info["groq_configured"] is True
    assert info["groq_model"] == "llama-3.3-70b-versatile"
    assert "groq" in info["available_providers"]


def test_groq_chat_model_uses_groq_when_key_present(monkeypatch):
    settings = Settings(
        llm_provider="groq",
        groq_api_key="gsk_test_key",
        groq_model="llama-3.3-70b-versatile",
    )

    class FakeChatGroq:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    monkeypatch.setitem(
        __import__("sys").modules,
        "langchain_groq",
        type("m", (), {"ChatGroq": FakeChatGroq}),
    )

    model = LLMService(settings).get_chat_model()
    assert isinstance(model, FakeChatGroq)
    assert model.kwargs["model"] == "llama-3.3-70b-versatile"
