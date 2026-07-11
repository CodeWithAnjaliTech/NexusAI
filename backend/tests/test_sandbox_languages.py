"""Tests for sandbox shell command building and languages."""

from app.services.code_executor import build_shell_command
from app.services.code_languages import LANGUAGE_CONFIGS, normalize_language, supported_languages
from app.services.stack_trace_parser import extract_any_code, extract_code_block


def test_supported_languages_count():
    langs = supported_languages()
    assert len(langs) >= 15
    assert all("starter_code" in lang for lang in langs)
    assert langs[0]["starter_code"]


def test_normalize_language_aliases():
    assert normalize_language("py") == "python"
    assert normalize_language("js") == "javascript"
    assert normalize_language("invalid_lang") is None


def test_extract_code_block():
    text = "```javascript\nconsole.log('hi')\n```"
    block = extract_code_block(text)
    assert block is not None
    assert block[0] == "javascript"
    assert "console.log" in block[1]


def test_extract_any_code_python():
    text = "```python\nprint(1)\n```"
    result = extract_any_code(text)
    assert result is not None
    assert result[0] in ("python", "py")


def test_build_shell_command_multiline_javascript():
    code = """const employees = [
  { id: 1, name: "Anjali", role: "Dev" },
];
console.log(employees[0].name);"""
    cfg = LANGUAGE_CONFIGS["javascript"]
    cmd = build_shell_command(code, cfg)
    assert "base64 -d" in cmd
    assert "/tmp/sandbox.js" in cmd
    assert "node /tmp/sandbox.js" in cmd
    assert 'node -e "' not in cmd
    assert "$CODE" not in cmd


def test_build_shell_command_python_uses_file():
    cfg = LANGUAGE_CONFIGS["python"]
    cmd = build_shell_command('print("hi")\nprint("there")', cfg)
    assert "/tmp/sandbox.py" in cmd
    assert "python /tmp/sandbox.py" in cmd
    assert 'python -c "' not in cmd
