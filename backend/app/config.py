"""Application configuration via pydantic-settings."""

from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Centralized configuration loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "NexusAI"
    app_env: str = "development"
    debug: bool = True
    api_v1_prefix: str = "/api/v1"

    database_url: str = "postgresql+asyncpg://nexusai:nexusai_dev@localhost:5433/nexusai"
    redis_url: str = "redis://localhost:6379/0"

    chroma_host: str = "localhost"
    chroma_port: int = 8001
    chroma_collection: str = "nexusai_knowledge"

    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"
    ollama_embedding_model: str = "nomic-embed-text"

    langchain_tracing_v2: bool = False
    langchain_api_key: str = ""
    langchain_project: str = "nexusai"

    cors_origins: List[str] = Field(
        default=["http://localhost:5173", "http://localhost:3000"]
    )

    upload_dir: str = "uploads"
    max_upload_size_mb: int = 50

    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    # Phase 2: Code sandbox
    sandbox_use_docker: bool = True
    sandbox_image: str = "python:3.12-alpine"
    sandbox_timeout_seconds: int = 45
    sandbox_memory_limit: str = "128m"
    sandbox_cpu_limit: float = 0.5
    sandbox_max_code_chars: int = 8000
    sandbox_max_concurrent: int = 5
    sandbox_prewarm_on_startup: bool = True
    sandbox_warm_containers: bool = True
    sandbox_docker_check_seconds: int = 3
    sandbox_pull_timeout_seconds: int = 30
    sandbox_container_start_seconds: int = 20

    # LLM providers
    llm_provider: str = "ollama"  # ollama | openai | anthropic
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-3-5-haiku-20241022"

    # Phase 3: RAG
    rag_rerank_enabled: bool = True
    rag_top_k: int = 5
    rag_fetch_k: int = 15

    # Phase 5: Auth & rate limiting
    rate_limit_requests: int = 60
    rate_limit_window_seconds: int = 60

    # Code review
    code_review_max_zip_mb: int = 50
    code_review_max_files: int = 80
    code_review_max_file_chars: int = 4000
    code_review_max_context_chars: int = 28000

    @property
    def chroma_url(self) -> str:
        return f"http://{self.chroma_host}:{self.chroma_port}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
