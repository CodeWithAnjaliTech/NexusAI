"""Tool executor — runs agent tools and returns context + graph events."""

import json
import re

from app.graph.state import GraphEvent
from app.tools.calculator import calculate, extract_math_expression
from app.tools.github_tool import fetch_repo_context, repo_display_name
from app.tools.registry import AGENT_TOOLS
from app.tools.web_search import needs_web_search, web_search


def _tool_event(name: str, label: str, status: str = "completed", **metadata) -> GraphEvent:
    return {
        "node": f"tool_{name}",
        "type": "tool",
        "label": label,
        "status": status,
        "metadata": metadata,
    }


def execute_agent_tools(
    query: str,
    agent_key: str,
    *,
    github_repo_url: str | None = None,
    github_token: str | None = None,
    use_github: bool = False,
) -> tuple[str, list[GraphEvent]]:
    """Run tools allowed for this agent. Returns (context_block, graph_events)."""
    allowed = AGENT_TOOLS.get(agent_key, [])
    if not allowed and not (github_repo_url and use_github):
        return "", []

    blocks: list[str] = []
    events: list[GraphEvent] = []

    if "web_search" in allowed and needs_web_search(query):
        event = _tool_event("web_search", "Web Search", status="running")
        events.append(event)
        result = web_search(query)
        event["status"] = "completed"
        event["metadata"]["result_length"] = len(result)
        blocks.append(f"Web search results:\n{result}")

    if "calculator" in allowed:
        expr = extract_math_expression(query)
        if expr or re.search(r"\d+\s*[\+\-\*/\^]\s*\d+", query):
            event = _tool_event("calculator", "Calculator", status="running")
            events.append(event)
            try:
                expression = expr or re.search(r"[\d+\-*/().\s^]+", query).group().strip()
                result = calculate(expression)
                event["status"] = "completed"
                event["metadata"]["expression"] = expression
                blocks.append(f"Calculator result for `{expression}`: {result}")
            except Exception as exc:
                event["status"] = "failed"
                event["metadata"]["error"] = str(exc)

    if github_repo_url and use_github:
        repo_label = repo_display_name(github_repo_url)
        event = _tool_event(
            "github",
            f"Context: GitHub — {repo_label}",
            status="running",
            repo=repo_label,
        )
        events.append(event)
        repo_context = fetch_repo_context(github_repo_url, github_token)
        event["status"] = "completed"
        blocks.append(f"GitHub repository context:\n{repo_context}")

    if not blocks:
        return "", events

    return "\n\n---\n".join(blocks), events
