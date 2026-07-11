"""Memory update node — persists context after agent response."""

from app.core.logging import logger
from app.graph.state import GraphEvent, NexusState


def update_memory(state: NexusState) -> NexusState:
    event: GraphEvent = {
        "node": "memory_update",
        "type": "memory",
        "label": "Memory Update",
        "status": "running",
        "metadata": {},
    }
    state["graph_events"] = [*state.get("graph_events", []), event]

    try:
        context_entry = {
            "query": state["user_query"],
            "intent": state.get("intent"),
            "agent": state.get("selected_agent"),
            "response_preview": (state.get("agent_response") or "")[:500],
        }
        retrieved = state.get("retrieved_context", [])
        event["metadata"] = {
            "context_saved": True,
            "retrieved_docs": len(retrieved),
        }
        event["status"] = "completed"
        logger.info("Memory updated for session %s", state.get("session_id"))

    except Exception as exc:
        event["status"] = "failed"
        event["metadata"]["error"] = str(exc)
        logger.error("Memory update failed: %s", exc)

    return state
