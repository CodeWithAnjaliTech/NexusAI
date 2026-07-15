"""LLM service — supports Ollama, OpenAI, Anthropic, and Groq."""

from functools import lru_cache

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_ollama import ChatOllama, OllamaEmbeddings

from app.config import Settings, get_settings
from app.core.logging import logger


class LLMService:
    """Factory for chat and embedding models."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def get_chat_model(
        self,
        temperature: float = 0.3,
        *,
        provider_override: str | None = None,
        model_override: str | None = None,
    ) -> BaseChatModel:
        provider = (provider_override or self._settings.llm_provider).lower()
        openai_model = model_override if provider == "openai" and model_override else self._settings.openai_model
        anthropic_model = (
            model_override if provider == "anthropic" and model_override else self._settings.anthropic_model
        )
        ollama_model = model_override if provider == "ollama" and model_override else self._settings.ollama_model
        groq_model = model_override if provider == "groq" and model_override else self._settings.groq_model

        if provider == "openai" and self._settings.openai_api_key:
            try:
                from langchain_openai import ChatOpenAI

                return ChatOpenAI(
                    api_key=self._settings.openai_api_key,
                    model=openai_model,
                    temperature=temperature,
                )
            except ImportError:
                logger.warning("langchain-openai not installed, falling back to Ollama")

        if provider == "anthropic" and self._settings.anthropic_api_key:
            try:
                from langchain_anthropic import ChatAnthropic

                return ChatAnthropic(
                    api_key=self._settings.anthropic_api_key,
                    model=anthropic_model,
                    temperature=temperature,
                )
            except ImportError:
                logger.warning("langchain-anthropic not installed, falling back to Ollama")

        if provider == "groq" and self._settings.groq_api_key:
            try:
                from langchain_groq import ChatGroq

                return ChatGroq(
                    api_key=self._settings.groq_api_key,
                    model=groq_model,
                    temperature=temperature,
                )
            except ImportError:
                logger.warning("langchain-groq not installed, falling back to Ollama")

        return ChatOllama(
            base_url=self._settings.ollama_base_url,
            model=ollama_model,
            temperature=temperature,
        )

    def get_chat_model_for_user(self, user, temperature: float = 0.3) -> BaseChatModel:
        from app.services.user_preferences import get_llm_preferences

        prefs = get_llm_preferences(user)
        return self.get_chat_model(
            temperature=temperature,
            provider_override=prefs.get("provider"),
            model_override=prefs.get("model"),
        )

    def get_embeddings(self) -> OllamaEmbeddings:
        return OllamaEmbeddings(
            base_url=self._settings.ollama_base_url,
            model=self._settings.ollama_embedding_model,
        )

    def provider_info(self, user=None) -> dict:
        provider = self._settings.llm_provider.lower()
        user_provider = None
        user_model = None
        if user is not None:
            from app.services.user_preferences import get_llm_preferences

            prefs = get_llm_preferences(user)
            user_provider = prefs.get("provider")
            user_model = prefs.get("model")

        effective_provider = (user_provider or provider).lower()
        active_model = (
            user_model
            or (
                self._settings.openai_model
                if effective_provider == "openai" and self._settings.openai_api_key
                else self._settings.anthropic_model
                if effective_provider == "anthropic" and self._settings.anthropic_api_key
                else self._settings.groq_model
                if effective_provider == "groq" and self._settings.groq_api_key
                else self._settings.ollama_model
            )
        )

        return {
            "provider": effective_provider,
            "default_provider": provider,
            "user_provider": user_provider,
            "user_model": user_model,
            "ollama_model": self._settings.ollama_model,
            "ollama_base_url": self._settings.ollama_base_url,
            "openai_model": self._settings.openai_model if self._settings.openai_api_key else None,
            "openai_configured": bool(self._settings.openai_api_key),
            "anthropic_model": self._settings.anthropic_model
            if self._settings.anthropic_api_key
            else None,
            "anthropic_configured": bool(self._settings.anthropic_api_key),
            "groq_model": self._settings.groq_model if self._settings.groq_api_key else None,
            "groq_configured": bool(self._settings.groq_api_key),
            "active_model": active_model,
            "available_providers": [
                p
                for p, ok in (
                    ("ollama", True),
                    ("groq", bool(self._settings.groq_api_key)),
                    ("openai", bool(self._settings.openai_api_key)),
                    ("anthropic", bool(self._settings.anthropic_api_key)),
                )
                if ok
            ],
        }


@lru_cache
def get_llm_service() -> LLMService:
    return LLMService(get_settings())
