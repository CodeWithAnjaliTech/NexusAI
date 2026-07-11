"""Base agent runner with shared LLM invocation pattern."""

from langchain_core.messages import HumanMessage, SystemMessage

from app.config import get_settings
from app.core.logging import logger
from app.graph.state import GraphEvent, NexusState
from app.services.diagram_prompts import augment_custom_prompt, build_agent_system_prompt
from app.services.llm import get_llm_service
from app.services.rag_helpers import _format_rag_context, _search_vector_store
from app.services.context_policy import should_show_document_citations, should_use_github
from app.services.rag_policy import rag_context_preamble, should_use_document_rag
from app.services.vector_store import get_vector_store
from app.tools.executor import execute_agent_tools


def _github_from_state(state: NexusState) -> dict:
    token = state.get("github_token") or ""
    repo_url = state.get("github_repo_url") or ""
    if repo_url:
        return {"repo_url": repo_url, "token": token or None}
    return {}


def _run_agent(
    state: NexusState,
    agent_key: str,
    agent_name: str,
    system_prompt: str,
    use_rag: bool = False,
    temperature: float = 0.3,
) -> NexusState:
    settings = get_settings()
    query = state["user_query"]
    override = state.get("custom_system_prompt")
    if override:
        system_prompt = augment_custom_prompt(override, query)
    else:
        system_prompt = build_agent_system_prompt(system_prompt, query)
    event: GraphEvent = {
        "node": agent_key,
        "type": "agent",
        "label": agent_name,
        "status": "running",
        "metadata": {"agent": agent_key},
    }
    state["graph_events"] = [*state.get("graph_events", []), event]
    state["selected_agent"] = agent_key

    context_block = ""
    citations: list[dict] = []

    memory_context = state.get("memory_context") or ""
    if memory_context:
        system_prompt = f"{system_prompt}\n\n{memory_context}"

    gh = _github_from_state(state)
    context_source = state.get("context_source") or "auto"
    doc_id = state.get("document_id") or None
    proj_id = state.get("project_id") or None
    use_github = should_use_github(context_source, gh.get("repo_url"), query)
    tool_context, tool_events = execute_agent_tools(
        query,
        agent_key,
        github_repo_url=gh.get("repo_url"),
        github_token=gh.get("token"),
        use_github=use_github,
    )
    state["graph_events"] = [*state.get("graph_events", []), *tool_events]
    if tool_context:
        context_block += f"\n\n{tool_context}"

    if use_rag and should_use_document_rag(query, doc_id, context_source, proj_id):
        rag_event: GraphEvent = {
            "node": f"{agent_key}_retrieval",
            "type": "tool",
            "label": "Context: Knowledge document",
            "status": "running",
            "metadata": {"document_id": doc_id or ""},
        }
        state["graph_events"] = [*state.get("graph_events", []), rag_event]

        try:
            vector_store = get_vector_store()
            if vector_store is None:
                raise RuntimeError("ChromaDB unavailable")
            results = _search_vector_store(
                query,
                document_id=doc_id,
                project_id=proj_id,
            )

            state["retrieved_context"] = results
            if results:
                formatted, citations = _format_rag_context(results)
                show_citations = should_show_document_citations(context_source, query, doc_id)
                context_block = rag_context_preamble(show_citations) + formatted
                if not show_citations:
                    citations = []
            rag_event["status"] = "completed"
            rag_event["metadata"]["docs_retrieved"] = len(results)
        except Exception as exc:
            rag_event["status"] = "failed"
            rag_event["metadata"]["error"] = str(exc)
            logger.warning("RAG retrieval failed: %s", exc)

    state["citations"] = citations

    try:
        llm = get_llm_service().get_chat_model(temperature=temperature)
        response = llm.invoke(
            [
                SystemMessage(content=system_prompt),
                HumanMessage(content=f"{query}{context_block}"),
            ]
        )
        state["agent_response"] = (
            response.content if isinstance(response.content, str) else str(response.content)
        )
        event["status"] = "completed"
        event["metadata"]["response_length"] = len(state["agent_response"])
        event["metadata"]["citations"] = len(citations)

    except Exception as exc:
        logger.error("Agent %s failed: %s", agent_key, exc)
        state["agent_response"] = f"Agent encountered an error: {exc}"
        state["error"] = str(exc)
        event["status"] = "failed"
        event["metadata"]["error"] = str(exc)

    return state
