"""User preference helpers."""

from app.db.models.user import User
from app.services.user_preferences import get_llm_preferences, set_llm_preferences


def test_set_llm_preferences_ignores_empty_strings():
    user = User(email="test@example.com", display_name="Test", hashed_password="x", preferences='{"llm":{"provider":"openai","model":"gpt-4o"}}')

    result = set_llm_preferences(user, "", "")
    prefs = get_llm_preferences(user)

    assert result["provider"] is None
    assert result["model"] is None
    assert prefs["provider"] is None
    assert prefs["model"] is None


def test_set_llm_preferences_stores_trimmed_values():
    user = User(email="test@example.com", display_name="Test", hashed_password="x", preferences="{}")

    set_llm_preferences(user, "  ollama  ", "  llama3.2  ")
    prefs = get_llm_preferences(user)

    assert prefs["provider"] == "ollama"
    assert prefs["model"] == "llama3.2"
