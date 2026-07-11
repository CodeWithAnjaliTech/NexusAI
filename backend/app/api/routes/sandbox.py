"""Code sandbox API routes."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_auth
from app.db.models.user import User
from app.db.session import get_db
from app.schemas.sandbox import (
    SandboxExecuteRequest,
    SandboxExecuteResponse,
    SandboxLanguagesResponse,
    StackFrameResponse,
    StackTraceParseRequest,
    StackTraceParseResponse,
)
from app.services.analytics_service import analytics_service
from app.services.code_executor import code_executor, docker_ready
from app.services.code_languages import normalize_language, supported_languages
from app.services.stack_trace_parser import parse_stack_trace

router = APIRouter(prefix="/sandbox", tags=["sandbox"])


@router.get("/status")
async def sandbox_status() -> dict:
    ready, message = docker_ready()
    return {"docker_ready": ready, "message": message}


@router.get("/languages", response_model=SandboxLanguagesResponse)
async def list_languages() -> SandboxLanguagesResponse:
    langs = supported_languages()
    return SandboxLanguagesResponse(languages=langs)


@router.post("/execute", response_model=SandboxExecuteResponse)
async def execute_code(
    body: SandboxExecuteRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
) -> SandboxExecuteResponse:
    lang = normalize_language(body.language)
    if not lang:
        supported = ", ".join(l["key"] for l in supported_languages())
        return SandboxExecuteResponse(
            stdout="",
            stderr=f"Language '{body.language}' not supported. Supported: {supported}",
            exit_code=1,
            runtime_ms=0,
            sandbox="none",
            language=body.language,
        )

    result = await code_executor.execute(body.code, lang, stdin=body.stdin)
    await analytics_service.record_sandbox_run(
        db,
        success=result.exit_code == 0 and not result.blocked,
        user_id=user.id,
        organization_id=user.organization_id,
    )
    parsed = None
    trace_text = result.stderr or body.code
    if result.exit_code != 0 and lang == "python":
        pt = parse_stack_trace(trace_text)
        if pt:
            parsed = StackTraceParseResponse(
                exception_type=pt.exception_type,
                message=pt.message,
                frames=[
                    StackFrameResponse(
                        file=f.file, line=f.line, function=f.function, code=f.code
                    )
                    for f in pt.frames
                ],
                root_cause=pt.root_cause,
                summary=pt.summary(),
            )

    return SandboxExecuteResponse(
        stdout=result.stdout,
        stderr=result.stderr,
        exit_code=result.exit_code,
        runtime_ms=result.runtime_ms,
        sandbox=result.sandbox,
        language=result.language,
        blocked=result.blocked,
        block_reason=result.block_reason,
        parsed_trace=parsed,
    )


@router.post("/parse-trace", response_model=StackTraceParseResponse)
async def parse_trace(body: StackTraceParseRequest) -> StackTraceParseResponse:
    pt = parse_stack_trace(body.traceback_text)
    if not pt:
        return StackTraceParseResponse(
            exception_type="Unknown",
            message=body.traceback_text[:500],
            frames=[],
            root_cause=None,
            summary="Could not parse traceback.",
        )
    return StackTraceParseResponse(
        exception_type=pt.exception_type,
        message=pt.message,
        frames=[
            StackFrameResponse(file=f.file, line=f.line, function=f.function, code=f.code)
            for f in pt.frames
        ],
        root_cause=pt.root_cause,
        summary=pt.summary(),
    )
