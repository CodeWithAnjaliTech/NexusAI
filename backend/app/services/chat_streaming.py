"""Streaming chat service with real LLM token streaming."""

import asyncio
from collections.abc import AsyncIterator

from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy.ext.asyncio import AsyncSession

from app.graph.agents.blueprint import SYSTEM_PROMPT as BLUEPRINT_PROMPT
from app.graph.agents.code_sandbox import SYSTEM_PROMPT as CODE_PROMPT
from app.graph.agents.documentation import SYSTEM_PROMPT as DOC_PROMPT
from app.graph.agents.general import SYSTEM_PROMPT as GENERAL_PROMPT
from app.graph.agents.research import SYSTEM_PROMPT as RESEARCH_PROMPT
from app.services.diagram_prompts import augment_custom_prompt, build_agent_system_prompt
from app.services.llm import get_llm_service
from app.services.context_policy import should_use_github
from app.services.rag_helpers import build_rag_context, fetch_rag_citations
from app.services.rag_policy import should_use_document_rag
from app.tools.executor import execute_agent_tools

AGENT_PROMPTS: dict[str, str] = {
    "code_sandbox": CODE_PROMPT,
    "blueprint": BLUEPRINT_PROMPT,
    "documentation": DOC_PROMPT,
    "research": RESEARCH_PROMPT,
    "general": GENERAL_PROMPT,
}

RAG_AGENTS = {"blueprint", "documentation", "research"}


async def stream_llm_response(
    *,
    user_query: str,
    agent_key: str = "general",
    custom_system_prompt: str | None = None,
    document_id: str | None = None,
    project_id: str | None = None,
    use_rag: bool | None = None,
    memory_context: str = "",
    user=None,
    github_repo_url: str | None = None,
    github_token: str | None = None,
    context_source: str = "auto",
    tool_events: list | None = None,
    db: AsyncSession | None = None,
) -> AsyncIterator[str]:
    """Stream tokens from the LLM for a given agent configuration."""
    system_prompt = custom_system_prompt or AGENT_PROMPTS.get(agent_key, GENERAL_PROMPT)
    if custom_system_prompt:
        system_prompt = augment_custom_prompt(custom_system_prompt, user_query)
    else:
        system_prompt = build_agent_system_prompt(system_prompt, user_query)
    context_block = ""
    should_rag = (
        use_rag
        if use_rag is not None
        else should_use_document_rag(user_query, document_id, context_source, project_id)
    )

    if memory_context:
        system_prompt = f"{system_prompt}\n\n{memory_context}"

    use_github = should_use_github(context_source, github_repo_url, user_query)
    tool_context, events = await asyncio.to_thread(
        execute_agent_tools,
        user_query,
        agent_key,
        github_repo_url=github_repo_url,
        github_token=github_token,
        use_github=use_github,
    )
    if tool_events is not None:
        tool_events.extend(events)
    if tool_context:
        context_block += f"\n\n{tool_context}"

    if should_rag:
        rag_block, _ = await build_rag_context(
            db,
            user_query,
            document_id=document_id,
            project_id=project_id,
        )
        if rag_block:
            context_block += rag_block
        elif document_id:
            context_block += (
                "\n\nNote: A document was attached but no indexed content could be retrieved. "
                "Tell the user the file may still be processing or could not be indexed."
            )

    llm = (
        get_llm_service().get_chat_model_for_user(user, temperature=0.3)
        if user is not None
        else get_llm_service().get_chat_model(temperature=0.3)
    )
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=f"{user_query}{context_block}"),
    ]

    async for chunk in llm.astream(messages):
        part = chunk.content if isinstance(chunk.content, str) else str(chunk.content or "")
        if part:
            yield part


async def prefetch_rag_citations(
    db: AsyncSession | None,
    query: str,
    document_id: str | None = None,
    project_id: str | None = None,
    context_source: str = "auto",
) -> list[dict]:
    """Fetch citations for the done event, using the same retrieval path as streaming."""
    if not should_use_document_rag(query, document_id, context_source, project_id):
        return []
    if db is not None and document_id:
        _, citations = await build_rag_context(
            db,
            query,
            document_id=document_id,
            project_id=project_id,
        )
        if citations:
            return citations
    return await asyncio.to_thread(fetch_rag_citations, query, document_id, project_id)
