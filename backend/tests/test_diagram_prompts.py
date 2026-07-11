"""Tests for diagram prompt detection and enforced responses."""

from app.services.diagram_prompts import (
    build_login_diagram_markdown,
    enforce_diagram_response,
    get_deterministic_diagram_response,
    has_valid_ascii_flowchart,
    user_wants_diagram,
    user_wants_login_diagram,
)


def test_user_wants_diagram_typo():
    assert user_wants_diagram("give me daigram")
    assert user_wants_diagram("show flowchart for login")


def test_user_wants_login_diagram():
    assert user_wants_login_diagram("give me diagram for user login")
    assert user_wants_login_diagram("authentication flow chart")


def test_deterministic_login_response():
    text = get_deterministic_diagram_response("give me diagram for user login")
    assert text is not None
    assert "Form Validation" in text
    assert "```flowchart" in text
    assert "Redirect to" in text


def test_enforce_strips_mermaid_for_login_request():
    bad = "Here you go:\n\n```mermaid\nsequenceDiagram\nUser->>API: x\n```"
    fixed = enforce_diagram_response("diagram for user login", bad)
    assert "```mermaid" not in fixed
    assert has_valid_ascii_flowchart(fixed)
    assert "Form Validation" in fixed


def test_enforce_keeps_valid_flowchart():
    good = build_login_diagram_markdown()
    assert enforce_diagram_response("show flowchart", good) == good
