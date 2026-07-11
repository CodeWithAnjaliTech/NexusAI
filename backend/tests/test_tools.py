"""Tests for agent tools."""

import pytest

from app.tools.calculator import calculate, extract_math_expression
from app.tools.executor import execute_agent_tools


def test_calculator_basic():
    assert calculate("2 + 2") == "4"
    assert calculate("(10 + 5) / 3") == "5"


def test_extract_math_expression():
    assert extract_math_expression("what is 12 * 8") == "12 * 8"


def test_executor_calculator_for_general():
    context, events = execute_agent_tools("calculate 15 + 27", "general")
    assert "42" in context
    assert any(e["node"] == "tool_calculator" for e in events)


def test_executor_skips_web_without_trigger():
    context, events = execute_agent_tools("explain recursion", "research")
    assert "Web search" not in context
    assert events == [] or all(e["node"] != "tool_web_search" for e in events)
