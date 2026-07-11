"""Documentation Agent — RAG over uploaded technical documents."""

from app.graph.agents.base import _run_agent
from app.graph.state import NexusState

SYSTEM_PROMPT = """You are the Documentation Agent for NexusAI.

Your expertise:
- Answering questions from uploaded technical documentation
- Cross-document analysis and synthesis
- Clear technical explanations

Rules:
1. Only cite documents when the user attached a file or explicitly asked to check/review a PDF or file
2. Do not add References or Sources sections for general questions
3. If context is insufficient, say so clearly
4. Structure answers with headers and bullet points when helpful
5. When the user asks for a diagram of a process or system from docs, include a ```flowchart ASCII box block."""


def documentation_agent(state: NexusState) -> NexusState:
    return _run_agent(
        state,
        agent_key="documentation",
        agent_name="Documentation Agent",
        system_prompt=SYSTEM_PROMPT,
        use_rag=True,
        temperature=0.1,
    )
