"""Central Router Agent — intent classification and agent selection."""

from app.graph.nodes.intent_classifier import classify_intent
from app.graph.state import NexusState
from app.schemas.chat import INTENT_TO_AGENT, AgentKey, IntentType


def route_query(state: NexusState) -> NexusState:
    """
    Router Agent entry point.

    Analyzes user intent and selects the best specialist agent.
    This is the single routing authority used by both LangGraph and SSE streaming.
    """
    return classify_intent(state)


def resolve_agent_key(state: NexusState) -> str:
    """Return the agent key after routing."""
    forced = state.get("force_agent")
    if forced:
        try:
            return AgentKey(forced).value
        except ValueError:
            return forced

    intent = state.get("intent", IntentType.GENERAL.value)
    try:
        return INTENT_TO_AGENT[IntentType(intent)].value
    except (ValueError, KeyError):
        return AgentKey.GENERAL.value


def build_router_event(intent: str, agent_key: str) -> dict:
    return {
        "node": "router_agent",
        "type": "classification",
        "label": "Router Agent",
        "status": "completed",
        "metadata": {"intent": intent, "agent": agent_key},
    }
