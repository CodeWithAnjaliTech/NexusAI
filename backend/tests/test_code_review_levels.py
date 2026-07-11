"""Tests for experience-level code review prompts."""

from app.services.code_review_levels import (
    build_review_system_prompt,
    normalize_experience_level,
)


def test_normalize_experience_level_defaults_invalid():
    assert normalize_experience_level(None) == "intermediate"
    assert normalize_experience_level("staff") == "intermediate"
    assert normalize_experience_level("senior") == "senior"


def test_beginner_prompt_is_encouraging():
    prompt = build_review_system_prompt("beginner")
    assert "BEGINNER" in prompt
    assert "encouraging" in prompt.lower() or "Encouraging" in prompt


def test_senior_prompt_is_concise_and_strategic():
    prompt = build_review_system_prompt("senior")
    assert "SENIOR" in prompt or "Senior" in prompt
    assert "trade-off" in prompt.lower() or "strategic" in prompt.lower()
