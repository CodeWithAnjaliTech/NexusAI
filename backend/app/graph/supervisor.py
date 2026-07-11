"""LangGraph Supervisor — orchestrates intent routing and agent execution."""

from functools import lru_cache

from langgraph.graph import END, START, StateGraph

from app.graph.agents.blueprint import blueprint_agent
from app.graph.agents.code_sandbox import code_sandbox_agent
from app.graph.agents.documentation import documentation_agent
from app.graph.agents.general import general_agent
from app.graph.agents.research import research_agent
from app.graph.nodes.intent_classifier import classify_intent
from app.graph.nodes.memory_update import update_memory
from app.graph.nodes.response_validation import validate_response
from app.graph.state import GraphEvent, NexusState
from app.schemas.chat import INTENT_TO_AGENT, AgentKey, IntentType


def route_to_agent(state: NexusState) -> str:
    """Conditional edge: map intent to agent node name."""
    forced = state.get("force_agent")
    if forced:
        try:
            return AgentKey(forced).value
        except ValueError:
            pass

    intent = state.get("intent", IntentType.GENERAL.value)
    try:
        intent_enum = IntentType(intent)
    except ValueError:
        intent_enum = IntentType.GENERAL

    agent = INTENT_TO_AGENT[intent_enum]
    return agent.value


def build_supervisor_graph() -> StateGraph:
    """
    Build the LangGraph supervisor pipeline:

    START → Intent Classifier → [Agent Router] → Memory Update → Response Validation → END
    """
    graph = StateGraph(NexusState)

    graph.add_node("intent_classifier", classify_intent)
    graph.add_node("code_sandbox", code_sandbox_agent)
    graph.add_node("blueprint", blueprint_agent)
    graph.add_node("documentation", documentation_agent)
    graph.add_node("research", research_agent)
    graph.add_node("general", general_agent)
    graph.add_node("memory_update", update_memory)
    graph.add_node("response_validation", validate_response)

    graph.add_edge(START, "intent_classifier")

    graph.add_conditional_edges(
        "intent_classifier",
        route_to_agent,
        {
            AgentKey.CODE_SANDBOX.value: "code_sandbox",
            AgentKey.BLUEPRINT.value: "blueprint",
            AgentKey.DOCUMENTATION.value: "documentation",
            AgentKey.RESEARCH.value: "research",
            AgentKey.GENERAL.value: "general",
        },
    )

    for agent_node in [
        "code_sandbox",
        "blueprint",
        "documentation",
        "research",
        "general",
    ]:
        graph.add_edge(agent_node, "memory_update")

    graph.add_edge("memory_update", "response_validation")
    graph.add_edge("response_validation", END)

    return graph


@lru_cache
def get_compiled_graph():
    return build_supervisor_graph().compile()


async def run_supervisor(
    user_query: str,
    session_id: str,
    user_id: str,
    force_agent: str | None = None,
    document_id: str | None = None,
    project_id: str | None = None,
    custom_system_prompt: str | None = None,
    memory_context: str = "",
    github_repo_url: str = "",
    github_token: str = "",
    context_source: str = "auto",
) -> NexusState:
    """Execute the full supervisor graph for a user query."""
    initial_event: GraphEvent = {
        "node": "user_query",
        "type": "input",
        "label": "User Query",
        "status": "completed",
        "metadata": {"query": user_query[:200]},
    }

    initial_state: NexusState = {
        "messages": [],
        "user_query": user_query,
        "session_id": session_id,
        "user_id": user_id,
        "force_agent": force_agent or "",
        "document_id": document_id or "",
        "project_id": project_id or "",
        "custom_system_prompt": custom_system_prompt or "",
        "memory_context": memory_context,
        "github_repo_url": github_repo_url,
        "github_token": github_token,
        "context_source": context_source or "auto",
        "intent": "",
        "selected_agent": "",
        "agent_response": "",
        "retrieved_context": [],
        "citations": [],
        "graph_events": [initial_event],
        "validation_passed": False,
        "error": None,
        "execution_result": None,
    }

    graph = get_compiled_graph()
    result = await graph.ainvoke(initial_state)

    final_event: GraphEvent = {
        "node": "final_response",
        "type": "output",
        "label": "Final Response",
        "status": "completed" if result.get("validation_passed") else "failed",
        "metadata": {"agent": result.get("selected_agent")},
    }
    result["graph_events"] = [*result.get("graph_events", []), final_event]
    return result
