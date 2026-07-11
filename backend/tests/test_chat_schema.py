"""Tests for chat schema force_agent and document_id."""

from uuid import uuid4

from app.schemas.chat import AgentKey, ChatRequest, ContextSource, IntentType


def test_chat_request_force_agent():
    req = ChatRequest(message="hello", force_agent=AgentKey.CODE_SANDBOX)
    assert req.force_agent == AgentKey.CODE_SANDBOX


def test_chat_request_document_scope():
    doc_id = uuid4()
    req = ChatRequest(message="summarize", document_id=doc_id)
    assert req.document_id == doc_id


def test_chat_request_context_source():
    req = ChatRequest(message="hello", context_source=ContextSource.GITHUB)
    assert req.context_source == ContextSource.GITHUB
    assert ChatRequest(message="hello").context_source == ContextSource.AUTO


def test_intent_to_agent_mapping():
    from app.schemas.chat import INTENT_TO_AGENT

    assert INTENT_TO_AGENT[IntentType.CODING].value == "code_sandbox"
