"""Response validation node — ensures quality before returning."""

from app.core.logging import logger
from app.graph.state import GraphEvent, NexusState


def validate_response(state: NexusState) -> NexusState:
    event: GraphEvent = {
        "node": "response_validation",
        "type": "validation",
        "label": "Response Validation",
        "status": "running",
        "metadata": {},
    }
    state["graph_events"] = [*state.get("graph_events", []), event]

    response = state.get("agent_response", "")
    passed = bool(response and len(response.strip()) > 10)

    if not passed:
        state["agent_response"] = (
            "I apologize, but I was unable to generate a complete response. "
            "Please try rephrasing your question."
        )
        state["validation_passed"] = False
        event["status"] = "failed"
    else:
        state["validation_passed"] = True
        event["status"] = "completed"

    event["metadata"]["passed"] = state["validation_passed"]
    logger.info("Response validation: %s", "passed" if passed else "failed")
    return state
