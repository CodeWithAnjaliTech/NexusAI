"""Tests for explicit chat context source policy."""

import pytest

from app.schemas.chat import ContextSource
from app.services.context_policy import (
    should_show_document_citations,
    should_use_document_rag,
    should_use_github,
)


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        (ContextSource.NONE, False),
        (ContextSource.GITHUB, True),
        (ContextSource.DOCUMENT, False),
        (ContextSource.BOTH, True),
    ],
)
def test_should_use_github_explicit_modes(source, expected):
    assert should_use_github(source, "https://github.com/org/repo", "hello") is expected


def test_should_use_github_auto_requires_keyword():
    url = "https://github.com/org/repo"
    assert should_use_github(ContextSource.AUTO, url, "review my repository") is True
    assert should_use_github(ContextSource.AUTO, url, "hello world") is False


def test_should_use_github_without_repo():
    assert should_use_github(ContextSource.GITHUB, None, "my repo") is False


@pytest.mark.parametrize(
    ("source", "doc_id", "expected"),
    [
        (ContextSource.NONE, "doc-1", False),
        (ContextSource.GITHUB, "doc-1", False),
        (ContextSource.DOCUMENT, "doc-1", True),
        (ContextSource.DOCUMENT, None, False),
        (ContextSource.BOTH, "doc-1", True),
        (ContextSource.BOTH, None, False),
    ],
)
def test_should_use_document_rag_explicit_modes(source, doc_id, expected):
    assert should_use_document_rag(source, "summarize", doc_id) is expected


def test_should_use_document_rag_auto_with_attachment():
    assert should_use_document_rag(ContextSource.AUTO, "hello", "doc-1") is True


def test_should_use_document_rag_auto_with_document_keyword():
    assert should_use_document_rag(ContextSource.AUTO, "summarize my pdf", None) is True
    assert should_use_document_rag(ContextSource.AUTO, "hello world", None) is False


def test_should_show_document_citations_explicit_document():
    assert should_show_document_citations(ContextSource.DOCUMENT, "hello", "doc-1") is True
    assert should_show_document_citations(ContextSource.DOCUMENT, "hello", None) is False


def test_executor_github_explicit_flag():
    from app.tools.executor import execute_agent_tools

    context, events = execute_agent_tools(
        "hello",
        "general",
        github_repo_url="https://github.com/org/repo",
        use_github=True,
    )
    assert "GitHub repository context" in context
    assert events[0]["label"].startswith("Context: GitHub")


def test_executor_github_skipped_without_flag():
    from app.tools.executor import execute_agent_tools

    context, events = execute_agent_tools(
        "review my repository",
        "general",
        github_repo_url="https://github.com/org/repo",
        use_github=False,
    )
    assert context == ""
    assert events == []
