"""Tool registry — maps agents to available tools."""

from dataclasses import dataclass
from typing import Callable


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    run: Callable[..., str]


AGENT_TOOLS: dict[str, list[str]] = {
    "research": ["web_search", "calculator"],
    "general": ["calculator"],
    "code_sandbox": ["calculator"],
    "documentation": [],
    "blueprint": [],
}
