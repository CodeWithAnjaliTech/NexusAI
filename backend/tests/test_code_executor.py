"""Sandbox docker readiness and shell command tests."""

from unittest.mock import patch

from app.services.code_executor import build_shell_command, docker_ready
from app.services.code_languages import LANGUAGE_CONFIGS


def test_build_shell_command_unique_run_id():
    cfg = LANGUAGE_CONFIGS["javascript"]
    cmd = build_shell_command('console.log("hi")', cfg, run_id="abc123")
    assert "/tmp/abc123.js" in cmd
    assert "/tmp/sandbox.js" not in cmd


def test_docker_ready_when_unavailable():
    with patch("app.services.code_executor.subprocess.run") as run_mock:
        run_mock.return_value.returncode = 1
        run_mock.return_value.stderr = "Cannot connect to the Docker daemon"
        ready, message = docker_ready(timeout=1)
    assert ready is False
    assert message is not None
    assert "Docker" in message
