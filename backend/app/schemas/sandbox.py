"""Sandbox execution schemas."""

from pydantic import BaseModel, Field


class SandboxExecuteRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=8000)
    language: str = Field(default="python")
    stdin: str | None = Field(default=None, max_length=4000)


class StackTraceParseRequest(BaseModel):
    traceback_text: str = Field(..., min_length=1)


class StackFrameResponse(BaseModel):
    file: str
    line: int
    function: str
    code: str | None = None


class StackTraceParseResponse(BaseModel):
    exception_type: str
    message: str
    frames: list[StackFrameResponse]
    root_cause: str | None
    summary: str


class SandboxExecuteResponse(BaseModel):
    stdout: str
    stderr: str
    exit_code: int
    runtime_ms: int
    sandbox: str
    language: str = "python"
    blocked: bool = False
    block_reason: str | None = None
    parsed_trace: StackTraceParseResponse | None = None


class SandboxLanguageItem(BaseModel):
    key: str
    label: str
    starter_code: str = ""


class SandboxLanguagesResponse(BaseModel):
    languages: list[SandboxLanguageItem]
