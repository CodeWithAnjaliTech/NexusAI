"""Shared diagram instructions + guaranteed ASCII flowchart output."""

import re

DIAGRAM_REQUEST_RE = re.compile(
    r"\b("
    r"diagram|diagrams|daigram|daigrams|flowchart|flowcharts|flow chart|flow charts|"
    r"sequence diagram|sequence diagrams|architecture diagram|architecture diagrams|"
    r"visuali[sz]e|visuali[sz]ation|draw me|draw a|draw|chart|charts|mermaid|"
    r"process map|process flow|workflow diagram|workflow chart|show me how|show me"
    r")\b",
    re.IGNORECASE,
)

LOGIN_FLOW_RE = re.compile(
    r"\b(login|log in|sign in|signin|sign-in|authentication|auth flow|user login|login flow)\b",
    re.IGNORECASE,
)

BOX_CHAR_RE = re.compile(r"[┌┐└┘├┤┬┴┼─│▼▲←→↔]")
FLOWCHART_FENCE_RE = re.compile(r"```flowchart\s*\n([\s\S]*?)```", re.IGNORECASE)
MERMAID_FENCE_RE = re.compile(r"```mermaid\s*\n([\s\S]*?)```", re.IGNORECASE)

LOGIN_ASCII_BODY = """┌─────────────┐
│    User     │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ Enter Email &   │
│ Password        │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Form Validation │
│ (Required Data) │
└──────┬──────────┘
       │
       ▼
   Is Valid?
    ┌──┴──┐
   No    Yes
    │      │
    ▼      ▼
Show Error  Send Login Request
 Message          │
                  ▼
         ┌─────────────────┐
         │ Backend API     │
         │ Authentication  │
         └──────┬──────────┘
                │
                ▼
        User Exists?
          ┌──┴──┐
         No    Yes
          │      │
          ▼      ▼
   Return Error  Verify Password
                     │
                     ▼
              Password Match?
                ┌──┴──┐
               No    Yes
                │      │
                ▼      ▼
         Invalid Password
                      Generate JWT/
                      Session Token
                           │
                           ▼
                 Store Token
              (Cookie/LocalStorage)
                           │
                           ▼
                 Redirect to
                   Dashboard"""

LOGIN_ASCII_TEMPLATE = f"```flowchart\n{LOGIN_ASCII_BODY}\n```"

GENERIC_ASCII_BODY = """┌─────────────┐
│    Start    │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  Process Step   │
└──────┬──────────┘
       │
       ▼
    Decision?
    ┌──┴──┐
   No    Yes
    │      │
    ▼      ▼
  Retry   Done
    │      │
    └──┬───┘
       ▼
┌─────────────┐
│     End     │
└─────────────┘"""

ENGINEER_RESPONSE_RULES = """
Response rules:
- You are the user's AI Engineer: practical, direct, senior engineer tone.
- Do not add References, Sources, or citation lists unless the user attached a document or explicitly asked to check/review a PDF or file.
"""

ASCII_DIAGRAM_RULES = """
Diagram rules — output MUST use a ```flowchart code block with Unicode box art (┌ ─ │ └ ▼):
- Never use ```mermaid unless the user explicitly asked for Mermaid.
- Never use bullet lists instead of a diagram when a diagram was requested.
- Put 1 short intro sentence, then the ```flowchart block, then 1 short summary sentence.
"""

DIAGRAM_REQUEST_DIRECTIVE = """
The user asked for a diagram. Your entire reply must include a ```flowchart ASCII box-drawing block.
"""

MERMAID_OPTIONAL_RULES = """
Use ```mermaid only because the user asked for Mermaid/sequence/SVG explicitly.
"""


def user_wants_diagram(query: str) -> bool:
    return bool(DIAGRAM_REQUEST_RE.search((query or "").strip()))


def user_wants_login_diagram(query: str) -> bool:
    return user_wants_diagram(query) and bool(LOGIN_FLOW_RE.search((query or "").strip()))


def user_wants_mermaid(query: str) -> bool:
    lowered = (query or "").lower()
    return "mermaid" in lowered or "sequence diagram" in lowered or "svg diagram" in lowered


def should_buffer_diagram_response(user_query: str) -> bool:
    """Buffer LLM output for diagram requests so we can enforce format before streaming."""
    return user_wants_diagram(user_query) and not user_wants_mermaid(user_query)


def has_valid_ascii_flowchart(text: str) -> bool:
    for match in FLOWCHART_FENCE_RE.finditer(text or ""):
        body = match.group(1)
        if BOX_CHAR_RE.search(body) and body.count("\n") >= 3:
            return True
    return False


def strip_mermaid_blocks(text: str) -> str:
    cleaned = MERMAID_FENCE_RE.sub("", text or "")
    return re.sub(r"\n{3,}", "\n\n", cleaned).strip()


def wrap_flowchart(body: str) -> str:
    return f"```flowchart\n{body.strip()}\n```"


def build_login_diagram_markdown() -> str:
    return (
        "Here's a **user login flow diagram** for a typical web application:\n\n"
        f"{LOGIN_ASCII_TEMPLATE}\n\n"
        "This covers client validation, API authentication, credential checks, "
        "JWT/session creation, token storage, and redirect to the dashboard."
    )


def build_generic_diagram_markdown(user_query: str) -> str:
    topic = (user_query or "process").strip()[:80]
    return (
        f"Here's a **flowchart** for your request ({topic}):\n\n"
        f"{wrap_flowchart(GENERIC_ASCII_BODY)}\n\n"
        "Adjust labels to match your exact workflow if needed."
    )


def get_deterministic_diagram_response(user_query: str) -> str | None:
    """Return a canned diagram response — used when the LLM cannot be trusted to format correctly."""
    if user_wants_mermaid(user_query):
        return None
    if user_wants_login_diagram(user_query):
        return build_login_diagram_markdown()
    return None


def enforce_diagram_response(user_query: str, response: str) -> str:
    """Guarantee a ```flowchart ASCII block in the final assistant message."""
    if user_wants_mermaid(user_query) or not user_wants_diagram(user_query):
        return response

    if user_wants_login_diagram(user_query):
        return build_login_diagram_markdown()

    cleaned = strip_mermaid_blocks(response)

    if has_valid_ascii_flowchart(cleaned):
        intro = cleaned.split("```flowchart", 1)[0].strip()
        match = FLOWCHART_FENCE_RE.search(cleaned)
        diagram = match.group(0) if match else wrap_flowchart(GENERIC_ASCII_BODY)
        outro = cleaned.split("```", 2)[-1].strip() if cleaned.count("```") >= 2 else ""
        parts = [p for p in (intro, diagram, outro) if p]
        return "\n\n".join(parts)

    if BOX_CHAR_RE.search(cleaned):
        lines = cleaned.splitlines()
        start = next((i for i, line in enumerate(lines) if "┌" in line), None)
        if start is not None:
            block_lines = []
            for line in lines[start:]:
                if block_lines and not line.strip() and not BOX_CHAR_RE.search(line):
                    if any(BOX_CHAR_RE.search(l) for l in block_lines):
                        break
                block_lines.append(line.rstrip())
            ascii_body = "\n".join(block_lines).strip()
            intro = "\n".join(lines[:start]).strip()
            if ascii_body:
                diagram = wrap_flowchart(ascii_body)
                if intro:
                    return f"{intro}\n\n{diagram}"
                return diagram

    return build_generic_diagram_markdown(user_query)


def iter_stream_chunks(text: str, size: int = 64):
    for index in range(0, len(text), size):
        yield text[index : index + size]


def build_agent_system_prompt(base_prompt: str, user_query: str = "") -> str:
    parts = [
        base_prompt.rstrip(),
        ENGINEER_RESPONSE_RULES.strip(),
        ASCII_DIAGRAM_RULES.strip(),
    ]
    if user_wants_mermaid(user_query):
        parts.append(MERMAID_OPTIONAL_RULES.strip())
    if user_wants_diagram(user_query):
        parts.append(DIAGRAM_REQUEST_DIRECTIVE.strip())
        parts.append(f"Copy this exact login diagram when the topic is login/auth:\n{LOGIN_ASCII_TEMPLATE}")
    return "\n\n".join(parts)


def augment_custom_prompt(custom_prompt: str, user_query: str) -> str:
    if not user_wants_diagram(user_query):
        return custom_prompt
    extra = [DIAGRAM_REQUEST_DIRECTIVE.strip(), ASCII_DIAGRAM_RULES.strip()]
    if user_wants_login_diagram(user_query):
        extra.append(LOGIN_ASCII_TEMPLATE)
    return f"{custom_prompt.rstrip()}\n\n" + "\n\n".join(extra)
