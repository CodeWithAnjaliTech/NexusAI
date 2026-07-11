"""LangGraph shared state definition."""

from typing import Annotated, Any, TypedDict

from langgraph.graph.message import add_messages


class GraphEvent(TypedDict, total=False):
    node: str
    type: str
    label: str
    status: str
    metadata: dict[str, Any]


class NexusState(TypedDict):
    """State passed through the LangGraph supervisor pipeline."""

    messages: Annotated[list, add_messages]
    user_query: str
    session_id: str
    user_id: str
    force_agent: str
    document_id: str
    project_id: str
    custom_system_prompt: str
    memory_context: str
    github_repo_url: str
    github_token: str
    context_source: str
    intent: str
    selected_agent: str
    agent_response: str
    retrieved_context: list[dict[str, Any]]
    citations: list[dict[str, Any]]
    graph_events: list[GraphEvent]
    validation_passed: bool
    error: str | None
    execution_result: dict[str, Any] | None
