"""User preferences stored in User.preferences JSON."""

import json
from typing import Any

from app.db.models.user import User


def load_preferences(user: User) -> dict[str, Any]:
    try:
        return json.loads(user.preferences or "{}")
    except json.JSONDecodeError:
        return {}


def save_preferences(user: User, prefs: dict[str, Any]) -> None:
    user.preferences = json.dumps(prefs)


def get_llm_preferences(user: User) -> dict[str, str | None]:
    prefs = load_preferences(user)
    llm = prefs.get("llm", {})
    return {
        "provider": llm.get("provider"),
        "model": llm.get("model"),
    }


def set_llm_preferences(user: User, provider: str | None, model: str | None) -> dict[str, str | None]:
    prefs = load_preferences(user)
    llm = prefs.setdefault("llm", {})
    if provider is not None:
        if provider.strip():
            llm["provider"] = provider.strip()
        else:
            llm.pop("provider", None)
    if model is not None:
        cleaned = model.strip()
        if cleaned:
            llm["model"] = cleaned
        else:
            llm.pop("model", None)
    save_preferences(user, prefs)
    return {"provider": llm.get("provider"), "model": llm.get("model")}


def get_github_settings(user: User) -> dict:
    return load_preferences(user).get("github", {})


def set_github_settings(user: User, github: dict) -> None:
    prefs = load_preferences(user)
    prefs["github"] = github
    save_preferences(user, prefs)
