"""Parse Python stack traces into structured diagnostics."""

import re
from dataclasses import dataclass, field


@dataclass
class StackFrame:
    file: str
    line: int
    function: str
    code: str | None = None


@dataclass
class ParsedTraceback:
    exception_type: str
    message: str
    frames: list[StackFrame] = field(default_factory=list)
    root_cause: str | None = None

    def summary(self) -> str:
        lines = [f"{self.exception_type}: {self.message}"]
        if self.frames:
            last = self.frames[-1]
            lines.append(f"  at {last.file}:{last.line} in {last.function}()")
        if self.root_cause:
            lines.append(f"Likely cause: {self.root_cause}")
        return "\n".join(lines)


_FRAME_RE = re.compile(
    r'^\s*File "(?P<file>[^"]+)", line (?P<line>\d+), in (?P<func>[^\n]+)\n'
    r"(?:\s*(?P<code>[^\n]+)\n)?",
    re.MULTILINE,
)
_EXCEPTION_RE = re.compile(r"^(\w+(?:Error|Exception|Warning)):\s*(.*)$", re.MULTILINE)


def parse_stack_trace(text: str) -> ParsedTraceback | None:
    """Extract structured traceback from raw error text."""
    if not text or "Traceback" not in text and "Error" not in text:
        return None

    exc_type, exc_msg = "Error", text.strip()
    for match in _EXCEPTION_RE.finditer(text):
        exc_type, exc_msg = match.group(1), match.group(2).strip()

    frames: list[StackFrame] = []
    for match in _FRAME_RE.finditer(text):
        frames.append(
            StackFrame(
                file=match.group("file"),
                line=int(match.group("line")),
                function=match.group("func").strip(),
                code=match.group("code").strip() if match.group("code") else None,
            )
        )

    root = _infer_root_cause(exc_type, exc_msg, frames)
    return ParsedTraceback(
        exception_type=exc_type,
        message=exc_msg,
        frames=frames,
        root_cause=root,
    )


def _infer_root_cause(exc_type: str, message: str, frames: list[StackFrame]) -> str | None:
    hints: dict[str, str] = {
        "ModuleNotFoundError": "Missing dependency — install the required package.",
        "ImportError": "Import failed — check module path and installed packages.",
        "NameError": "Undefined variable or function — check spelling and scope.",
        "TypeError": "Wrong type passed — verify function arguments.",
        "AttributeError": "Object lacks the attribute — check API usage.",
        "SyntaxError": "Invalid Python syntax — review the flagged line.",
        "IndentationError": "Inconsistent indentation — align blocks with spaces.",
        "KeyError": "Missing dictionary key — validate keys before access.",
        "IndexError": "List index out of range — check collection length.",
        "ValueError": "Invalid value for operation — validate input data.",
        "ZeroDivisionError": "Division by zero — add a guard before dividing.",
    }
    if exc_type in hints:
        return hints[exc_type]
    if frames:
        return f"Failure in {frames[-1].file} at line {frames[-1].line}."
    return None


CODE_BLOCK_LANGS = (
    "python", "py", "javascript", "js", "typescript", "ts", "java", "go", "golang",
    "rust", "rs", "c", "cpp", "c\\+\\+", "csharp", "cs", "ruby", "rb", "php",
    "bash", "sh", "sql", "kotlin", "kt", "swift", "r", "scala", "lua", "perl", "pl",
    "haskell", "hs", "dart", "shell",
)


def extract_code_block(text: str) -> tuple[str, str] | None:
    """Pull first fenced code block and return (language, code)."""
    pattern = rf"```({'|'.join(CODE_BLOCK_LANGS)})\s*\n(.*?)```"
    match = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
    if match:
        return match.group(1).strip().lower(), match.group(2).strip()
    return None


def extract_python_code(text: str) -> str | None:
    """Pull first ```python ... ``` block from markdown."""
    block = extract_code_block(text)
    if block:
        lang, code = block
        if lang in ("python", "py"):
            return code
    if "def " in text or "import " in text:
        lines = [ln for ln in text.splitlines() if not ln.strip().startswith("```")]
        candidate = "\n".join(lines).strip()
        if len(candidate) > 10:
            return candidate
    return None


def extract_any_code(text: str) -> tuple[str, str] | None:
    """Extract first code block of any supported language."""
    block = extract_code_block(text)
    if block:
        return block
    py = extract_python_code(text)
    if py:
        return "python", py
    return None
