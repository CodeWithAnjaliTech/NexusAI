"""Stack trace parser tests."""

from app.services.stack_trace_parser import extract_python_code, parse_stack_trace

SAMPLE_TRACEBACK = """
Traceback (most recent call last):
  File "app/main.py", line 42, in handler
    result = divide(a, b)
  File "app/utils.py", line 7, in divide
    return x / y
ZeroDivisionError: division by zero
"""


def test_parse_stack_trace():
    parsed = parse_stack_trace(SAMPLE_TRACEBACK)
    assert parsed is not None
    assert parsed.exception_type == "ZeroDivisionError"
    assert len(parsed.frames) == 2
    assert parsed.frames[-1].line == 7
    assert parsed.root_cause is not None


def test_extract_python_code_from_fence():
    text = "Please run this:\n```python\nprint('hello')\n```"
    code = extract_python_code(text)
    assert code == "print('hello')"
