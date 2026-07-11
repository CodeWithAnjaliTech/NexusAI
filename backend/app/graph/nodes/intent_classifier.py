"""Intent classification node."""

from langchain_core.messages import HumanMessage, SystemMessage

from app.core.logging import logger
from app.graph.state import GraphEvent, NexusState
from app.schemas.chat import IntentType
from app.services.llm import get_llm_service

INTENT_PROMPT = """You are an intent classifier for NexusAI, a multi-agent platform.

Classify the user query into exactly ONE of these intents:
- coding: code debugging, generation, refactoring, testing, API troubleshooting
- blueprint: engineering specs, standards, blueprints, compliance, requirements, architecture diagrams, flowcharts, mermaid diagrams
- documentation: searching or explaining uploaded technical documents
- research: analysis, comparison, reasoning, risk assessment, decision support
- general: everyday questions, productivity, learning, general assistance

Respond with ONLY the intent keyword (coding, blueprint, documentation, research, or general)."""


def heuristic_intent(query: str) -> str | None:
    """Fast keyword routing — avoids a blocking LLM call for common patterns."""
    lowered = query.lower()
    coding_keywords = (
        "debug",
        "error",
        "stack trace",
        "refactor",
        "unit test",
        "python",
        "react",
        "typescript",
        "javascript",
        "fix this code",
    )
    if any(kw in lowered for kw in coding_keywords):
        return IntentType.CODING.value
    if any(
        kw in lowered
        for kw in (
            "diagram",
            "daigram",
            "flowchart",
            "flow chart",
            "sequence diagram",
            "mermaid",
            "process flow",
            "workflow diagram",
            "architecture diagram",
        )
    ):
        return IntentType.BLUEPRINT.value
    if any(kw in lowered for kw in ("blueprint", "specification", "compliance", "standard", "iso")):
        return IntentType.BLUEPRINT.value
    if any(kw in lowered for kw in ("document", "manual", "uploaded", "pdf")):
        return IntentType.DOCUMENTATION.value
    if any(kw in lowered for kw in ("compare", "analyze", "research", "risk", "pros and cons", " vs ")):
        return IntentType.RESEARCH.value
    return None


def classify_intent(state: NexusState) -> NexusState:
    query = state["user_query"]
    forced = state.get("force_agent")
    if state.get("document_id") and not forced:
        attachment_intent = heuristic_intent(query) or IntentType.DOCUMENTATION.value
        event: GraphEvent = {
            "node": "intent_classifier",
            "type": "classification",
            "label": "Router Agent",
            "status": "completed",
            "metadata": {
                "query": query[:200],
                "intent": attachment_intent,
                "method": "attachment",
            },
        }
        state["graph_events"] = [*state.get("graph_events", []), event]
        state["intent"] = attachment_intent
        logger.info("Classified intent (attachment): %s", attachment_intent)
        return state

    if forced:
        agent_to_intent = {
            "code_sandbox": IntentType.CODING.value,
            "blueprint": IntentType.BLUEPRINT.value,
            "documentation": IntentType.DOCUMENTATION.value,
            "research": IntentType.RESEARCH.value,
            "general": IntentType.GENERAL.value,
        }
        intent = agent_to_intent.get(forced, IntentType.GENERAL.value)
        event: GraphEvent = {
            "node": "intent_classifier",
            "type": "classification",
            "label": "Router Agent",
            "status": "completed",
            "metadata": {"query": query[:200], "intent": intent, "forced_agent": forced},
        }
        state["graph_events"] = [*state.get("graph_events", []), event]
        state["intent"] = intent
        return state

    llm = get_llm_service().get_chat_model(temperature=0.0)

    event: GraphEvent = {
        "node": "intent_classifier",
        "type": "classification",
        "label": "Router Agent",
        "status": "running",
        "metadata": {"query": query[:200]},
    }
    state["graph_events"] = [*state.get("graph_events", []), event]

    fast_intent = heuristic_intent(query)
    if fast_intent:
        state["intent"] = fast_intent
        event["status"] = "completed"
        event["metadata"]["intent"] = fast_intent
        event["metadata"]["method"] = "heuristic"
        logger.info("Classified intent (heuristic): %s", fast_intent)
        return state

    try:
        response = llm.invoke(
            [
                SystemMessage(content=INTENT_PROMPT),
                HumanMessage(content=query),
            ]
        )
        raw = response.content.strip().lower() if isinstance(response.content, str) else "general"

        intent = IntentType.GENERAL.value
        for candidate in IntentType:
            if candidate.value in raw:
                intent = candidate.value
                break

        # Re-apply heuristics if LLM output is vague
        intent = heuristic_intent(query) or intent

        state["intent"] = intent
        event["status"] = "completed"
        event["metadata"]["intent"] = intent
        event["metadata"]["method"] = "llm"
        logger.info("Classified intent: %s", intent)

    except Exception as exc:
        logger.error("Intent classification failed: %s", exc)
        state["intent"] = IntentType.GENERAL.value
        event["status"] = "failed"
        event["metadata"]["error"] = str(exc)

    return state
