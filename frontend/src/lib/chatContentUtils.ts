import type { Citation } from "@/types/citations";
import type { FileAttachment } from "@/types";

const DOCUMENT_QUERY_RE =
  /\b(pdf|pdfs|document|documents|docx|doc|file|files|upload|uploaded|attached|attachment|resume|prd|summarize|summary|summarise|check (?:the|my|this|that)|review (?:the|my|this|that)|read (?:the|my|this|that))\b/i;

export function isDocumentFocusedQuery(text: string): boolean {
  return DOCUMENT_QUERY_RE.test(text.trim());
}

export function shouldShowCitations(
  citations: Citation[] | undefined,
  userQuery?: string,
  userAttachments?: FileAttachment[],
  contextSource?: import("@/types").ContextSource,
  contextDocumentId?: string | null,
): boolean {
  if (!citations?.length) return false;
  if (userAttachments?.length) return true;
  if (
    (contextSource === "document" || contextSource === "both") &&
    contextDocumentId
  ) {
    return true;
  }
  return isDocumentFocusedQuery(userQuery || "");
}

/** Strip model-added reference blocks and redundant diagram labels from chat markdown. */
export function sanitizeAssistantMarkdown(content: string): string {
  let text = content;

  text = text.replace(
    /\n\s*(?:#{1,3}\s*)?(?:\*\*)?References:?(?:\*\*)?\s*\n[\s\S]*?(?=\n\s*(?:#{1,3}\s*)?(?:\*\*)?(?:Mermaid Diagram|Diagram source)|\n\s*```mermaid|\n\s*```[a-z]|$)/gi,
    "\n",
  );
  text = text.replace(
    /\n\s*(?:#{1,3}\s*)?(?:\*\*)?References:?(?:\*\*)?\s*\n[\s\S]*$/gi,
    "",
  );
  text = text.replace(
    /\n\s*(?:#{1,3}\s*)?(?:\*\*)?Sources:?(?:\*\*)?\s*\n[\s\S]*?(?=\n\s*(?:#{1,3}\s*)?(?:\*\*)?(?:Mermaid Diagram|Diagram source)|\n\s*```mermaid|\n\s*```[a-z]|$)/gi,
    "\n",
  );
  text = text.replace(
    /\n\s*(?:#{1,3}\s*)?(?:\*\*)?Sources:?(?:\*\*)?\s*\n[\s\S]*$/gi,
    "",
  );
  text = text.replace(
    /\n\s*(?:#{1,3}\s*)?(?:\*\*)?Mermaid Diagram:?(?:\*\*)?\s*\n(?=\s*```mermaid)/gi,
    "\n",
  );

  return text.trim();
}

/** Hide unfinished fenced blocks while tokens are still streaming. */
export function stripIncompleteFencedBlocks(content: string): string {
  const lines = content.split("\n");
  let open = false;
  let openStart = 0;
  let charIndex = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      if (!open) {
        open = true;
        openStart = charIndex;
      } else {
        open = false;
      }
    }
    charIndex += line.length + 1;
  }

  if (open) return content.slice(0, openStart).trimEnd();
  return content;
}
