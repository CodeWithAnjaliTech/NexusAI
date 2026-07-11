"""LangSmith tracing setup."""

import os

from app.config import get_settings
from app.core.logging import logger


def configure_tracing() -> None:
    """Enable LangSmith when API key is configured."""
    settings = get_settings()
    if not settings.langchain_tracing_v2 or not settings.langchain_api_key:
        return

    os.environ["LANGCHAIN_TRACING_V2"] = "true"
    os.environ["LANGCHAIN_API_KEY"] = settings.langchain_api_key
    os.environ["LANGCHAIN_PROJECT"] = settings.langchain_project
    logger.info("LangSmith tracing enabled for project: %s", settings.langchain_project)
