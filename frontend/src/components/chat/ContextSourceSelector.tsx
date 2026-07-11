import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Check,
  FileText,
  Github,
  Layers,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/stores/chatStore";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  documentsQueryKey,
  isSelectableKnowledgeDoc,
} from "@/components/knowledge/documentUtils";
import type { ContextSource, GitHubSettings, UploadResponse } from "@/types";

interface ChatContextControlProps {
  disabled?: boolean;
}

type ContextOption = {
  value: ContextSource;
  label: string;
  description: string;
  icon: typeof Sparkles;
  disabled?: boolean;
};

function repoLabel(repoUrl: string | null | undefined): string {
  if (!repoUrl) return "Not connected";
  const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/i);
  if (match) return `${match[1]}/${match[2]}`;
  return repoUrl;
}

function truncate(text: string, max = 28): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function useChatContextData() {
  const projectId = useChatStore((s) => s.projectId);
  const contextSource = useChatStore((s) => s.contextSource);
  const contextDocumentId = useChatStore((s) => s.contextDocumentId);
  const setContextSource = useChatStore((s) => s.setContextSource);
  const setContextDocumentId = useChatStore((s) => s.setContextDocumentId);

  const { data: github } = useQuery({
    queryKey: ["github-settings"],
    queryFn: () => apiFetch<GitHubSettings>("/api/v1/integrations/github"),
  });

  const { data: documents = [] } = useQuery({
    queryKey: documentsQueryKey(projectId),
    queryFn: () => {
      const qs = projectId ? `?project_id=${projectId}` : "";
      return apiFetch<UploadResponse[]>(`/api/v1/documents${qs}`);
    },
  });

  const selectableDocs = useMemo(
    () => documents.filter(isSelectableKnowledgeDoc),
    [documents],
  );

  const selectedDoc = selectableDocs.find((d) => d.id === contextDocumentId);

  const handleSourceChange = (value: ContextSource) => {
    setContextSource(value);
    if (value !== "document" && value !== "both") {
      setContextDocumentId(null);
    } else if (!contextDocumentId && selectableDocs.length === 1) {
      setContextDocumentId(selectableDocs[0].id);
    }
  };

  const clearContext = () => {
    setContextSource("none");
    setContextDocumentId(null);
  };

  const isActive =
    contextSource !== "none" &&
    contextSource !== "auto" &&
    (contextSource !== "document" || Boolean(selectedDoc)) &&
    (contextSource !== "both" || Boolean(selectedDoc));

  return {
    github,
    selectableDocs,
    selectedDoc,
    contextSource,
    contextDocumentId,
    setContextDocumentId,
    handleSourceChange,
    clearContext,
    isActive,
  };
}

export function ChatContextPills({ disabled }: ChatContextControlProps) {
  const { github, selectedDoc, contextSource, clearContext, isActive } =
    useChatContextData();

  if (!isActive) return null;

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      {contextSource === "github" || contextSource === "both" ? (
        <span className="inline-flex max-w-[min(100%,14rem)] items-center gap-1 rounded-full border border-border/60 bg-muted/35 px-2.5 py-0.5 text-[11px]">
          <Github className="h-3 w-3 shrink-0 opacity-60" />
          <span className="truncate">{repoLabel(github?.repo_url)}</span>
        </span>
      ) : null}
      {(contextSource === "document" || contextSource === "both") && selectedDoc ? (
        <span className="inline-flex max-w-[min(100%,14rem)] items-center gap-1 rounded-full border border-border/60 bg-muted/35 px-2.5 py-0.5 text-[11px]">
          <FileText className="h-3 w-3 shrink-0 opacity-60" />
          <span className="truncate">{selectedDoc.filename}</span>
        </span>
      ) : null}
      <button
        type="button"
        onClick={clearContext}
        disabled={disabled}
        className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
        aria-label="Clear context"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export function ChatContextMenu({ disabled }: ChatContextControlProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const {
    github,
    selectableDocs,
    selectedDoc,
    contextSource,
    contextDocumentId,
    setContextDocumentId,
    handleSourceChange,
    isActive,
  } = useChatContextData();

  const options: ContextOption[] = useMemo(
    () => [
      {
        value: "none",
        label: "General chat",
        description: "No repo or document context",
        icon: Sparkles,
      },
      {
        value: "github",
        label: "GitHub repository",
        description: github?.connected
          ? repoLabel(github.repo_url)
          : "Connect in Settings",
        icon: Github,
        disabled: !github?.connected,
      },
      {
        value: "document",
        label: "Knowledge document",
        description: selectedDoc
          ? truncate(selectedDoc.filename, 32)
          : `${selectableDocs.length} doc${selectableDocs.length === 1 ? "" : "s"} available`,
        icon: FileText,
      },
      {
        value: "both",
        label: "GitHub + document",
        description: "Combine repo and file content",
        icon: Layers,
        disabled: !github?.connected,
      },
    ],
    [github, selectableDocs.length, selectedDoc],
  );

  const showDocumentPicker =
    contextSource === "document" || contextSource === "both";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div ref={panelRef} className="relative shrink-0">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "h-9 w-9 rounded-xl",
          isActive || open
            ? "bg-muted/60 text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        title="Reply context"
        aria-label="Reply context"
        aria-expanded={open}
      >
        <BookOpen className="h-4 w-4" />
      </Button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-[min(18rem,calc(100vw-3rem))] overflow-hidden rounded-xl border border-border bg-background shadow-lg">
          <div className="border-b border-border/60 px-3 py-2.5">
            <p className="text-xs font-medium">Reply using</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              GitHub repo, knowledge doc, or both
            </p>
          </div>

          <div className="max-h-[min(20rem,50vh)] overflow-y-auto p-1.5">
            {options.map(({ value, label, description, icon: Icon, disabled: optDisabled }) => {
              const selected = contextSource === value;
              return (
                <button
                  key={value}
                  type="button"
                  disabled={disabled || optDisabled}
                  onClick={() => handleSourceChange(value)}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                    selected ? "bg-muted" : "hover:bg-muted/50",
                    optDisabled && "cursor-not-allowed opacity-45",
                  )}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-xs font-medium">
                      {label}
                      {selected && <Check className="h-3 w-3" />}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                      {description}
                    </span>
                  </span>
                </button>
              );
            })}

            {showDocumentPicker && (
              <div className="mt-1 border-t border-border/60 px-1 pt-2">
                <label className="mb-1 block px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Document
                </label>
                <select
                  value={contextDocumentId ?? ""}
                  onChange={(e) => setContextDocumentId(e.target.value || null)}
                  disabled={disabled || selectableDocs.length === 0}
                  className="select-field mx-1 mb-1 h-9 w-[calc(100%-0.5rem)] text-xs"
                >
                  <option value="">
                    {selectableDocs.length === 0 ? "Upload in Knowledge first" : "Select document…"}
                  </option>
                  {selectableDocs.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.filename}
                      {doc.status === "stored" ? " (stored)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {!github?.connected && (
              <p className="px-2.5 py-1 text-[10px] text-muted-foreground">
                <Link to="/settings" className="underline underline-offset-2" onClick={() => setOpen(false)}>
                  Connect GitHub
                </Link>{" "}
                in Settings to use repo context.
              </p>
            )}

            <button
              type="button"
              disabled={disabled}
              onClick={() => handleSourceChange("auto")}
              className={cn(
                "mt-1 flex w-full rounded-lg px-2.5 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted/50",
                contextSource === "auto" && "bg-muted/60 text-foreground",
              )}
            >
              Auto-detect from keywords
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ChatContextControl({ disabled }: ChatContextControlProps) {
  return (
    <>
      <ChatContextPills disabled={disabled} />
      <ChatContextMenu disabled={disabled} />
    </>
  );
}

/** @deprecated Use ChatContextMenu */
export const ContextSourceSelector = ChatContextControl;

export function contextSourceHint(
  contextSource: ContextSource,
  docFilename?: string,
): string | null {
  if (contextSource === "none") return null;
  if (contextSource === "github") return "Reply uses your connected GitHub repo.";
  if (contextSource === "document") {
    return docFilename
      ? `Reply uses knowledge document: ${docFilename}.`
      : "Pick a document in the context menu.";
  }
  if (contextSource === "both") {
    return docFilename
      ? `Reply uses GitHub repo + ${docFilename}.`
      : "Pick a document for the knowledge side of context.";
  }
  return null;
}
