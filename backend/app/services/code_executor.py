"""Docker-isolated multi-language code execution — no host system access."""

import asyncio
import base64
import subprocess
import threading
import time
from dataclasses import dataclass
from uuid import uuid4

from app.config import get_settings
from app.core.logging import logger
from app.services.code_languages import LANGUAGE_CONFIGS, LanguageConfig, normalize_language

_execution_semaphore: asyncio.Semaphore | None = None
_pulled_images: set[str] = set()
_warm_containers: dict[str, str] = {}
_container_lock = threading.Lock()

PRIORITY_LANGUAGES = ("python", "javascript", "go", "java")

# (file path template with {rid}, shell command template with {path})
_RUNNERS: dict[str, tuple[str, str]] = {
    "python": ("/tmp/{rid}.py", "python {path}"),
    "javascript": ("/tmp/{rid}.js", "node {path}"),
    "ruby": ("/tmp/{rid}.rb", "ruby {path}"),
    "php": ("/tmp/{rid}.php", "php {path}"),
    "r": ("/tmp/{rid}.R", "Rscript {path}"),
    "lua": ("/tmp/{rid}.lua", "lua {path}"),
    "perl": ("/tmp/{rid}.pl", "perl {path}"),
    "typescript": (
        "/tmp/{rid}.ts",
        "npm install -g typescript 2>/dev/null; npx tsc {path} --outDir /tmp && node /tmp/{rid}.js",
    ),
    "java": ("/tmp/{rid}.java", "javac {path} && java -cp /tmp Main"),
    "go": ("/tmp/{rid}.go", "cd /tmp && go run {rid}.go"),
    "rust": ("/tmp/{rid}.rs", "rustc {path} -o /tmp/{rid} && /tmp/{rid}"),
    "c": ("/tmp/{rid}.c", "gcc {path} -o /tmp/{rid} && /tmp/{rid}"),
    "cpp": ("/tmp/{rid}.cpp", "g++ {path} -o /tmp/{rid} && /tmp/{rid}"),
    "csharp": (
        "/tmp/app/{rid}/Program.cs",
        "dotnet run --project /tmp/app/{rid} 2>/dev/null || "
        "(cd /tmp && csc Program.cs && mono Program.exe)",
    ),
    "bash": ("/tmp/{rid}.sh", "sh {path}"),
    "sql": (
        "/tmp/{rid}.sql",
        "apk add --no-cache sqlite 2>/dev/null; sqlite3 :memory: < {path}",
    ),
    "kotlin": (
        "/tmp/{rid}.kt",
        "apk add --no-cache kotlin 2>/dev/null; "
        "kotlinc {path} -include-runtime -d /tmp/{rid}.jar && java -jar /tmp/{rid}.jar",
    ),
    "swift": ("/tmp/{rid}.swift", "swift {path}"),
    "scala": (
        "/tmp/{rid}.scala",
        "apk add --no-cache scala 2>/dev/null; "
        "scalac {path} -d /tmp && scala -cp /tmp Main",
    ),
    "haskell": ("/tmp/{rid}.hs", "runhaskell {path}"),
    "dart": ("/tmp/{rid}.dart", "dart run {path}"),
}


def _get_semaphore() -> asyncio.Semaphore:
    global _execution_semaphore
    if _execution_semaphore is None:
        _execution_semaphore = asyncio.Semaphore(get_settings().sandbox_max_concurrent)
    return _execution_semaphore


def _container_name(cfg: LanguageConfig) -> str:
    return f"nexusai-sandbox-{cfg.key}"


def docker_ready(timeout: float | None = None) -> tuple[bool, str | None]:
    """Return quickly when Docker is unavailable instead of waiting for run timeouts."""
    settings = get_settings()
    wait = timeout if timeout is not None else settings.sandbox_docker_check_seconds
    try:
        proc = subprocess.run(
            ["docker", "info"],
            capture_output=True,
            text=True,
            timeout=wait,
            check=False,
        )
        if proc.returncode == 0:
            return True, None
        detail = (proc.stderr or proc.stdout or "").strip().splitlines()
        hint = detail[-1] if detail else "Docker daemon is not running."
        return False, f"Docker is unavailable: {hint} Start Docker Desktop, then try again."
    except subprocess.TimeoutExpired:
        return False, "Docker is not responding. Start Docker Desktop, then try again."
    except FileNotFoundError:
        return False, "Docker is not installed. Install Docker Desktop to use the playground."
    except Exception as exc:
        return False, f"Docker check failed: {exc}"


def build_shell_command(code: str, cfg: LanguageConfig, run_id: str | None = None) -> str:
    """Build a shell command that writes code to /tmp and executes it safely."""
    rid = run_id or "sandbox"
    b64 = base64.b64encode(code.encode("utf-8")).decode("ascii")
    runner = _RUNNERS.get(cfg.key)
    if not runner:
        return 'echo "Language runner not configured" && exit 1'

    path_template, run_template = runner
    path = path_template.format(rid=rid)
    run = run_template.format(path=path, rid=rid)

    if cfg.key == "csharp":
        return (
            f'mkdir -p /tmp/app/{rid} && echo "{b64}" | base64 -d > /tmp/app/{rid}/Program.cs && '
            f"dotnet run --project /tmp/app/{rid} 2>/dev/null || "
            f'(echo "{b64}" | base64 -d > /tmp/Program.cs && cd /tmp && csc Program.cs && mono Program.exe)'
        )
    if cfg.key == "java":
        return f'echo "{b64}" | base64 -d > {path} && javac {path} && java -cp /tmp Main'
    if cfg.key == "go":
        return f'echo "{b64}" | base64 -d > {path} && cd /tmp && go run {rid}.go'
    return f'echo "{b64}" | base64 -d > {path} && {run}'


@dataclass
class ExecutionResult:
    stdout: str
    stderr: str
    exit_code: int
    runtime_ms: int
    sandbox: str
    language: str = "python"
    blocked: bool = False
    block_reason: str | None = None


class CodeExecutor:
    """Run untrusted code in isolated Docker containers only."""

    def __init__(self) -> None:
        self._settings = get_settings()

    def _is_safe(self, code: str, cfg: LanguageConfig) -> tuple[bool, str | None]:
        lowered = code.lower()
        for pattern in cfg.forbidden:
            if pattern.lower() in lowered:
                return False, f"Blocked pattern: {pattern}"
        if len(code) > self._settings.sandbox_max_code_chars:
            return False, "Code exceeds maximum length"
        return True, None

    async def execute(self, code: str, language: str = "python", stdin: str | None = None) -> ExecutionResult:
        sem = _get_semaphore()
        async with sem:
            return await asyncio.to_thread(self.execute_sync, code, language, stdin)

    def execute_sync(self, code: str, language: str = "python", stdin: str | None = None) -> ExecutionResult:
        lang_key = normalize_language(language)
        if not lang_key:
            supported = sorted({c.key for c in LANGUAGE_CONFIGS.values()})
            return ExecutionResult(
                stdout="",
                stderr=f"Language '{language}' not supported. Supported: {', '.join(supported)}",
                exit_code=1,
                runtime_ms=0,
                sandbox="none",
                language=language,
            )

        cfg = LANGUAGE_CONFIGS[lang_key]
        safe, reason = self._is_safe(code, cfg)
        if not safe:
            return ExecutionResult(
                stdout="",
                stderr=reason or "Blocked",
                exit_code=1,
                runtime_ms=0,
                sandbox="none",
                language=lang_key,
                blocked=True,
                block_reason=reason,
            )

        if not self._settings.sandbox_use_docker:
            return ExecutionResult(
                stdout="",
                stderr=(
                    "Sandbox execution disabled: Docker isolation is required. "
                    "Set SANDBOX_USE_DOCKER=true. Host execution is not permitted."
                ),
                exit_code=1,
                runtime_ms=0,
                sandbox="none",
                language=lang_key,
                blocked=True,
                block_reason="Host execution disabled for security",
            )

        ready, docker_error = docker_ready()
        if not ready:
            return ExecutionResult(
                stdout="",
                stderr=docker_error or "Docker is unavailable.",
                exit_code=1,
                runtime_ms=0,
                sandbox="none",
                language=lang_key,
                blocked=True,
                block_reason=docker_error,
            )

        try:
            return self._run_docker(code, cfg, stdin)
        except subprocess.TimeoutExpired:
            return ExecutionResult(
                stdout="",
                stderr=(
                    f"Execution timed out after {self._settings.sandbox_timeout_seconds}s. "
                    "Try simpler code, or increase SANDBOX_TIMEOUT_SECONDS."
                ),
                exit_code=124,
                runtime_ms=self._settings.sandbox_timeout_seconds * 1000,
                sandbox="docker",
                language=lang_key,
            )
        except Exception as exc:
            logger.error("Docker sandbox failed: %s", exc)
            return ExecutionResult(
                stdout="",
                stderr=f"Docker sandbox unavailable: {exc}. Ensure Docker is running.",
                exit_code=1,
                runtime_ms=0,
                sandbox="none",
                language=lang_key,
            )

    def execute_python_sync(self, code: str) -> ExecutionResult:
        return self.execute_sync(code, "python")

    async def execute_python(self, code: str) -> ExecutionResult:
        return await self.execute(code, "python")

    def _image_exists(self, image: str) -> bool:
        try:
            proc = subprocess.run(
                ["docker", "image", "inspect", image],
                capture_output=True,
                timeout=5,
                check=False,
            )
            return proc.returncode == 0
        except Exception:
            return False

    def _ensure_image(self, image: str) -> None:
        if image in _pulled_images or self._image_exists(image):
            _pulled_images.add(image)
            return
        try:
            subprocess.run(
                ["docker", "pull", image],
                capture_output=True,
                text=True,
                timeout=self._settings.sandbox_pull_timeout_seconds,
                check=False,
            )
            _pulled_images.add(image)
        except subprocess.TimeoutExpired:
            logger.warning("Docker pull timed out for %s", image)
        except Exception as exc:
            logger.warning("Docker pull failed for %s: %s", image, exc)

    def _container_running(self, name: str) -> bool:
        try:
            proc = subprocess.run(
                ["docker", "inspect", "-f", "{{.State.Running}}", name],
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )
            return proc.returncode == 0 and proc.stdout.strip() == "true"
        except Exception:
            return False

    def _docker_run_flags(self) -> list[str]:
        return [
            "--network",
            "none",
            "--memory",
            self._settings.sandbox_memory_limit,
            "--cpus",
            str(self._settings.sandbox_cpu_limit),
            "--read-only",
            "--tmpfs",
            "/tmp:rw,noexec,size=64m",
            "--pull",
            "never",
        ]

    def _ensure_warm_container(self, cfg: LanguageConfig) -> str | None:
        name = _container_name(cfg)
        with _container_lock:
            if self._container_running(name):
                _warm_containers[cfg.key] = name
                return name

            self._ensure_image(cfg.image)
            subprocess.run(
                ["docker", "rm", "-f", name],
                capture_output=True,
                timeout=10,
                check=False,
            )
            proc = subprocess.run(
                [
                    "docker",
                    "run",
                    "-d",
                    "--name",
                    name,
                    *self._docker_run_flags(),
                    cfg.image,
                    "sleep",
                    "3600",
                ],
                capture_output=True,
                text=True,
                timeout=self._settings.sandbox_container_start_seconds,
                check=False,
            )
            if proc.returncode != 0:
                logger.warning("Warm container start failed for %s: %s", cfg.key, proc.stderr)
                return None

            _warm_containers[cfg.key] = name
            return name

    def _run_docker(self, code: str, cfg: LanguageConfig, stdin: str | None = None) -> ExecutionResult:
        start = time.perf_counter()
        run_id = uuid4().hex[:12]
        shell_cmd = build_shell_command(code, cfg, run_id=run_id)

        if self._settings.sandbox_warm_containers:
            container = self._ensure_warm_container(cfg)
            if container:
                proc = subprocess.run(
                    ["docker", "exec", "-i", container, "sh", "-c", shell_cmd],
                    capture_output=True,
                    text=True,
                    input=stdin,
                    timeout=self._settings.sandbox_timeout_seconds,
                    check=False,
                )
                elapsed = int((time.perf_counter() - start) * 1000)
                return ExecutionResult(
                    stdout=proc.stdout[:8000],
                    stderr=proc.stderr[:8000],
                    exit_code=proc.returncode,
                    runtime_ms=elapsed,
                    sandbox="docker-warm",
                    language=cfg.key,
                )

        self._ensure_image(cfg.image)
        proc = subprocess.run(
            [
                "docker",
                "run",
                "--rm",
                *self._docker_run_flags(),
                cfg.image,
                "sh",
                "-c",
                shell_cmd,
            ],
            capture_output=True,
            text=True,
            input=stdin,
            timeout=self._settings.sandbox_timeout_seconds,
            check=False,
        )
        elapsed = int((time.perf_counter() - start) * 1000)
        return ExecutionResult(
            stdout=proc.stdout[:8000],
            stderr=proc.stderr[:8000],
            exit_code=proc.returncode,
            runtime_ms=elapsed,
            sandbox="docker",
            language=cfg.key,
        )


def prewarm_sandbox_images() -> None:
    """Pull priority images and start warm containers for instant playground runs."""
    settings = get_settings()
    if not settings.sandbox_use_docker:
        return
    if not docker_ready()[0]:
        logger.warning("Skipping sandbox pre-warm — Docker unavailable")
        return

    executor = CodeExecutor()
    priority_cfgs = [LANGUAGE_CONFIGS[k] for k in PRIORITY_LANGUAGES if k in LANGUAGE_CONFIGS]
    other_images = sorted(
        {c.image for c in LANGUAGE_CONFIGS.values() if c.key not in PRIORITY_LANGUAGES}
    )

    logger.info("Pre-warming %d priority sandbox images…", len(priority_cfgs))
    for cfg in priority_cfgs:
        executor._ensure_image(cfg.image)
        if settings.sandbox_warm_containers:
            executor._ensure_warm_container(cfg)

    for image in other_images:
        executor._ensure_image(image)

    logger.info("Sandbox pre-warm complete")


code_executor = CodeExecutor()
