"""Code Sandbox Agent — debug, analyze, and execute code safely in Docker."""

from langchain_core.messages import HumanMessage, SystemMessage

from app.core.logging import logger
from app.graph.agents.base import _run_agent
from app.graph.state import GraphEvent, NexusState
from app.services.code_executor import code_executor
from app.services.code_languages import supported_languages
from app.services.llm import get_llm_service
from app.services.stack_trace_parser import extract_any_code, parse_stack_trace

_LANG_LIST = ", ".join(f"{l['label']} ({l['key']})" for l in supported_languages())

SYSTEM_PROMPT = f"""You are the Code Sandbox Agent for NexusAI.

Your expertise:
- Debugging, code generation, refactoring, and testing across IT languages
- Stack trace analysis using structured diagnostics
- Interpreting sandbox execution output (stdout/stderr)

Supported sandbox languages: {_LANG_LIST}

All code runs in isolated Docker containers with no host system access.

When execution output or parsed tracebacks are provided, use them as ground truth.

Provide:
1. Clear diagnosis
2. Root cause analysis
3. Suggested fix with code examples
4. Best practices

For execution flow or call-sequence visuals, use a ```mermaid sequenceDiagram or flowchart block (never mix syntax in one block).

Use code blocks with language tags (e.g. ```python, ```javascript, ```java)."""


def code_sandbox_agent(state: NexusState) -> NexusState:
    query = state["user_query"]
    extra_context = ""

    exec_event: GraphEvent = {
        "node": "code_sandbox_execute",
        "type": "tool",
        "label": "Sandbox Execution",
        "status": "running",
        "metadata": {},
    }
    state["graph_events"] = [*state.get("graph_events", []), exec_event]

    parsed = parse_stack_trace(query)
    if parsed:
        extra_context += f"\n\nParsed traceback:\n{parsed.summary()}\n"
        exec_event["metadata"]["trace_parsed"] = True

    extracted = extract_any_code(query)
    if extracted:
        language, code = extracted
        result = code_executor.execute_sync(code, language)

        state["execution_result"] = {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": result.exit_code,
            "sandbox": result.sandbox,
            "language": result.language,
        }
        extra_context += (
            f"\n\nSandbox execution ({result.language}, {result.sandbox}, {result.runtime_ms}ms):\n"
            f"exit_code={result.exit_code}\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}\n"
        )
        if result.stderr and not parsed:
            pt = parse_stack_trace(result.stderr)
            if pt:
                extra_context += f"\nParsed runtime traceback:\n{pt.summary()}\n"

        exec_event["status"] = "completed" if result.exit_code == 0 else "failed"
        exec_event["metadata"]["exit_code"] = result.exit_code
        exec_event["metadata"]["sandbox"] = result.sandbox
        exec_event["metadata"]["language"] = result.language
    else:
        exec_event["status"] = "completed"
        exec_event["metadata"]["skipped"] = True

    if extracted or parsed:
        event: GraphEvent = {
            "node": "code_sandbox",
            "type": "agent",
            "label": "Code Sandbox Agent",
            "status": "running",
            "metadata": {"agent": "code_sandbox"},
        }
        state["graph_events"] = [*state.get("graph_events", []), event]
        state["selected_agent"] = "code_sandbox"

        try:
            llm = get_llm_service().get_chat_model(temperature=0.2)
            response = llm.invoke(
                [
                    SystemMessage(content=SYSTEM_PROMPT),
                    HumanMessage(content=f"{query}{extra_context}"),
                ]
            )
            state["agent_response"] = (
                response.content if isinstance(response.content, str) else str(response.content)
            )
            event["status"] = "completed"
        except Exception as exc:
            logger.error("Code sandbox agent failed: %s", exc)
            state["agent_response"] = f"Code Sandbox Agent error: {exc}"
            event["status"] = "failed"
        return state

    return _run_agent(
        state,
        agent_key="code_sandbox",
        agent_name="Code Sandbox Agent",
        system_prompt=SYSTEM_PROMPT,
        temperature=0.2,
    )
