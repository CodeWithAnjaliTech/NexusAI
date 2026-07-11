"""Basic tests for intent routing and graph structure."""

import pytest

from app.graph.supervisor import build_supervisor_graph, route_to_agent
from app.graph.state import NexusState
from app.schemas.chat import AgentKey, IntentType


def test_supervisor_graph_has_all_nodes():
    graph = build_supervisor_graph()
    node_names = set(graph.nodes.keys())
    expected = {
        "intent_classifier",
        "code_sandbox",
        "blueprint",
        "documentation",
        "research",
        "general",
        "memory_update",
        "response_validation",
    }
    assert expected.issubset(node_names)


@pytest.mark.parametrize(
    "intent,expected_agent",
    [
        (IntentType.CODING.value, AgentKey.CODE_SANDBOX.value),
        (IntentType.BLUEPRINT.value, AgentKey.BLUEPRINT.value),
        (IntentType.DOCUMENTATION.value, AgentKey.DOCUMENTATION.value),
        (IntentType.RESEARCH.value, AgentKey.RESEARCH.value),
        (IntentType.GENERAL.value, AgentKey.GENERAL.value),
    ],
)
def test_route_to_agent(intent: str, expected_agent: str):
    state: NexusState = {
        "messages": [],
        "user_query": "test",
        "session_id": "s1",
        "user_id": "u1",
        "intent": intent,
        "selected_agent": "",
        "agent_response": "",
        "retrieved_context": [],
        "citations": [],
        "graph_events": [],
        "validation_passed": False,
        "error": None,
        "execution_result": None,
    }
    assert route_to_agent(state) == expected_agent
