"""Web search tool — fetches recent information via DuckDuckGo."""

import re

from app.core.logging import logger


def needs_web_search(query: str) -> bool:
    lowered = query.lower()
    triggers = (
        "latest",
        "current",
        "today",
        "recent",
        "news",
        "price of",
        "who is",
        "what happened",
        "search for",
        "look up",
        "2024",
        "2025",
        "2026",
    )
    return any(t in lowered for t in triggers)


def web_search(query: str, max_results: int = 5) -> str:
    """Run a web search and return a text summary for the LLM."""
    try:
        from langchain_community.tools import DuckDuckGoSearchRun

        search = DuckDuckGoSearchRun(max_results=max_results)
        result = search.run(query)
        if result and result.strip():
            return result.strip()
    except Exception as exc:
        logger.warning("DuckDuckGo search failed: %s", exc)

    try:
        import httpx

        resp = httpx.get(
            "https://api.duckduckgo.com/",
            params={"q": query, "format": "json", "no_html": 1, "skip_disambig": 1},
            timeout=8,
        )
        if resp.status_code == 200:
            data = resp.json()
            parts: list[str] = []
            if data.get("AbstractText"):
                parts.append(data["AbstractText"])
            for topic in data.get("RelatedTopics", [])[:max_results]:
                if isinstance(topic, dict) and topic.get("Text"):
                    parts.append(topic["Text"])
            if parts:
                return "\n".join(parts)
    except Exception as exc:
        logger.warning("DuckDuckGo instant API failed: %s", exc)

    return "No web results found."
