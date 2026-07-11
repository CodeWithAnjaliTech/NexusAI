"""Supported sandbox languages and Docker execution configs."""

from dataclasses import dataclass


@dataclass(frozen=True)
class LanguageConfig:
    key: str
    label: str
    image: str
    aliases: tuple[str, ...]
    forbidden: tuple[str, ...]
    needs_file: bool = False
    file_ext: str = ""
    compile_run: str = ""


# IT / software engineering languages — all run inside isolated Docker containers only.
LANGUAGE_CONFIGS: dict[str, LanguageConfig] = {}


def _register(cfg: LanguageConfig) -> None:
    LANGUAGE_CONFIGS[cfg.key] = cfg
    for alias in cfg.aliases:
        LANGUAGE_CONFIGS[alias] = cfg


_register(
    LanguageConfig(
        key="python",
        label="Python",
        image="python:3.12-alpine",
        aliases=("py",),
        forbidden=("import os", "import subprocess", "import shutil", "__import__", "open(", "eval(", "exec("),
    )
)
_register(
    LanguageConfig(
        key="javascript",
        label="JavaScript",
        image="node:20-alpine",
        aliases=("js", "nodejs"),
        forbidden=("require('fs'", 'require("fs"', "require('child_process'", "process.exit", "eval(", "Function("),
    )
)
_register(
    LanguageConfig(
        key="typescript",
        label="TypeScript",
        image="node:20-alpine",
        aliases=("ts",),
        forbidden=("require('fs'", 'require("fs"', "eval(", "Function("),
        needs_file=True,
        file_ext=".ts",
        compile_run="npm install -g typescript 2>/dev/null; npx tsc /tmp/code.ts --outDir /tmp && node /tmp/code.js",
    )
)
_register(
    LanguageConfig(
        key="java",
        label="Java",
        image="eclipse-temurin:21-alpine",
        aliases=(),
        forbidden=("Runtime.getRuntime", "ProcessBuilder", "java.io.File", "System.exit"),
        needs_file=True,
        file_ext=".java",
        compile_run="echo \"$CODE\" > /tmp/Main.java && javac /tmp/Main.java && java -cp /tmp Main",
    )
)
_register(
    LanguageConfig(
        key="go",
        label="Go",
        image="golang:1.22-alpine",
        aliases=("golang",),
        forbidden=("os/exec", "os.Remove", "os.Open", "syscall."),
        needs_file=True,
        file_ext=".go",
        compile_run='echo "$CODE" > /tmp/main.go && cd /tmp && go run main.go',
    )
)
_register(
    LanguageConfig(
        key="rust",
        label="Rust",
        image="rust:1-alpine",
        aliases=("rs",),
        forbidden=("std::process", "std::fs", "Command::"),
        needs_file=True,
        file_ext=".rs",
        compile_run='echo "$CODE" > /tmp/main.rs && rustc /tmp/main.rs -o /tmp/main && /tmp/main',
    )
)
_register(
    LanguageConfig(
        key="c",
        label="C",
        image="gcc:13",
        aliases=(),
        forbidden=("system(", "popen(", "exec(", "fork(", "#include <unistd"),
        needs_file=True,
        file_ext=".c",
        compile_run='echo "$CODE" > /tmp/main.c && gcc /tmp/main.c -o /tmp/main && /tmp/main',
    )
)
_register(
    LanguageConfig(
        key="cpp",
        label="C++",
        image="gcc:13",
        aliases=("c++", "cxx"),
        forbidden=("system(", "popen(", "exec(", "fork(", "#include <cstdlib"),
        needs_file=True,
        file_ext=".cpp",
        compile_run='echo "$CODE" > /tmp/main.cpp && g++ /tmp/main.cpp -o /tmp/main && /tmp/main',
    )
)
_register(
    LanguageConfig(
        key="csharp",
        label="C#",
        image="mcr.microsoft.com/dotnet/sdk:8.0-alpine",
        aliases=("cs", "dotnet"),
        forbidden=("System.Diagnostics.Process", "System.IO.File", "Environment.Exit"),
        needs_file=True,
        file_ext=".cs",
        compile_run='mkdir -p /tmp/app && echo "$CODE" > /tmp/app/Program.cs && dotnet run --project /tmp/app 2>/dev/null || (cd /tmp && echo "$CODE" > Program.cs && csc Program.cs && mono Program.exe)',
    )
)
_register(
    LanguageConfig(
        key="ruby",
        label="Ruby",
        image="ruby:3-alpine",
        aliases=("rb",),
        forbidden=("system(", "exec(", "open(", "`", "IO.popen", "File.open"),
    )
)
_register(
    LanguageConfig(
        key="php",
        label="PHP",
        image="php:8-alpine",
        aliases=(),
        forbidden=("exec(", "shell_exec(", "system(", "passthru(", "proc_open(", "file_get_contents("),
    )
)
_register(
    LanguageConfig(
        key="bash",
        label="Bash",
        image="alpine:3.19",
        aliases=("sh", "shell"),
        forbidden=("rm ", "curl ", "wget ", "nc ", "/etc/", "/proc/", "chmod ", "chown ", "> /", ">> /"),
        needs_file=True,
        file_ext=".sh",
        compile_run='echo "$CODE" > /tmp/script.sh && sh /tmp/script.sh',
    )
)
_register(
    LanguageConfig(
        key="sql",
        label="SQL",
        image="alpine:3.19",
        aliases=("sqlite",),
        forbidden=("ATTACH", "PRAGMA", ".read", ".import", "LOAD EXTENSION"),
        needs_file=True,
        file_ext=".sql",
        compile_run='apk add --no-cache sqlite 2>/dev/null; echo "$CODE" > /tmp/query.sql && sqlite3 :memory: < /tmp/query.sql',
    )
)
_register(
    LanguageConfig(
        key="kotlin",
        label="Kotlin",
        image="eclipse-temurin:21-alpine",
        aliases=("kt",),
        forbidden=("Runtime.getRuntime", "ProcessBuilder", "java.io.File"),
        needs_file=True,
        file_ext=".kt",
        compile_run='apk add --no-cache kotlin 2>/dev/null; echo "$CODE" > /tmp/Main.kt && kotlinc /tmp/Main.kt -include-runtime -d /tmp/main.jar && java -jar /tmp/main.jar',
    )
)
_register(
    LanguageConfig(
        key="swift",
        label="Swift",
        image="swift:5.10",
        aliases=(),
        forbidden=("Process(", "FileManager", "NSTask"),
        needs_file=True,
        file_ext=".swift",
        compile_run='echo "$CODE" > /tmp/main.swift && swift /tmp/main.swift',
    )
)
_register(
    LanguageConfig(
        key="r",
        label="R",
        image="r-base:4.3",
        aliases=(),
        forbidden=("system(", "shell(", "source(", "file("),
    )
)
_register(
    LanguageConfig(
        key="scala",
        label="Scala",
        image="eclipse-temurin:21-alpine",
        aliases=(),
        forbidden=("sys.process", "java.io.File", "Runtime.getRuntime"),
        needs_file=True,
        file_ext=".scala",
        compile_run='apk add --no-cache scala 2>/dev/null; echo "$CODE" > /tmp/Main.scala && scalac /tmp/Main.scala -d /tmp && scala -cp /tmp Main',
    )
)
_register(
    LanguageConfig(
        key="lua",
        label="Lua",
        image="lua:5.4-alpine",
        aliases=(),
        forbidden=("os.execute", "io.popen", "loadfile", "dofile"),
    )
)
_register(
    LanguageConfig(
        key="perl",
        label="Perl",
        image="perl:5-alpine",
        aliases=("pl",),
        forbidden=("system(", "exec(", "open(", "`", "qx/"),
    )
)
_register(
    LanguageConfig(
        key="haskell",
        label="Haskell",
        image="haskell:9.6",
        aliases=("hs",),
        forbidden=("System.Process", "System.IO", "unsafePerformIO"),
        needs_file=True,
        file_ext=".hs",
        compile_run='echo "$CODE" > /tmp/main.hs && runhaskell /tmp/main.hs',
    )
)
_register(
    LanguageConfig(
        key="dart",
        label="Dart",
        image="dart:3.3",
        aliases=(),
        forbidden=("dart:io", "Process.run", "File("),
        needs_file=True,
        file_ext=".dart",
        compile_run='echo "$CODE" > /tmp/main.dart && dart run /tmp/main.dart',
    )
)


def normalize_language(lang: str) -> str | None:
    key = lang.strip().lower()
    if key in LANGUAGE_CONFIGS:
        cfg = LANGUAGE_CONFIGS[key]
        return cfg.key
    return None


STARTER_TEMPLATES: dict[str, str] = {
    "python": 'print("Hello from NexusAI sandbox")',
    "javascript": 'console.log("Hello from NexusAI sandbox");',
    "typescript": 'const msg: string = "Hello from NexusAI sandbox";\nconsole.log(msg);',
    "java": 'public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello from NexusAI sandbox");\n  }\n}',
    "go": 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello from NexusAI sandbox")\n}',
    "rust": 'fn main() {\n    println!("Hello from NexusAI sandbox");\n}',
    "c": '#include <stdio.h>\n\nint main() {\n    printf("Hello from NexusAI sandbox\\n");\n    return 0;\n}',
    "cpp": '#include <iostream>\n\nint main() {\n    std::cout << "Hello from NexusAI sandbox" << std::endl;\n    return 0;\n}',
    "csharp": 'using System;\n\nclass Program {\n  static void Main() {\n    Console.WriteLine("Hello from NexusAI sandbox");\n  }\n}',
    "ruby": 'puts "Hello from NexusAI sandbox"',
    "php": '<?php\necho "Hello from NexusAI sandbox";\n',
    "bash": '#!/bin/sh\necho "Hello from NexusAI sandbox"',
    "sql": "SELECT 'Hello from NexusAI sandbox' AS greeting;",
    "kotlin": 'fun main() {\n    println("Hello from NexusAI sandbox")\n}',
    "swift": 'print("Hello from NexusAI sandbox")',
    "r": 'print("Hello from NexusAI sandbox")',
    "scala": 'object Main extends App {\n  println("Hello from NexusAI sandbox")\n}',
    "lua": 'print("Hello from NexusAI sandbox")',
    "perl": 'print "Hello from NexusAI sandbox\\n";',
    "haskell": 'main = putStrLn "Hello from NexusAI sandbox"',
    "dart": 'void main() {\n  print("Hello from NexusAI sandbox");\n}',
}


def supported_languages() -> list[dict[str, str]]:
    seen: set[str] = set()
    result: list[dict[str, str]] = []
    for cfg in LANGUAGE_CONFIGS.values():
        if cfg.key in seen:
            continue
        seen.add(cfg.key)
        result.append({
            "key": cfg.key,
            "label": cfg.label,
            "starter_code": STARTER_TEMPLATES.get(cfg.key, f"// {cfg.label}\n"),
        })
    return sorted(result, key=lambda x: x["label"])
