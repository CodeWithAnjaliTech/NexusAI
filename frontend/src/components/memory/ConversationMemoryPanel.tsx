import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Bot,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  MessageSquare,
  Search,
  Trash2,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, formatApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toastStore";
import { AGENT_LABELS, type AgentKey } from "@/types";

export interface ConversationTurn {
  turn_id: string;
  session_id: string | null;
  session_title: string | null;
  user_message: string;
  assistant_message: string | null;
  agent_key: string | null;
  intent: string | null;
  created_at: string;
  user_entry_id: string | null;
  assistant_entry_id: string | null;
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function previewText(text: string, max = 140): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trim()}…`;
}

interface TurnCardProps {
  turn: ConversationTurn;
  expanded: boolean;
  onToggle: () => void;
  onOpenChat: () => void;
  onDelete: () => void;
  deleting: boolean;
}

function TurnCard({ turn, expanded, onToggle, onOpenChat, onDelete, deleting }: TurnCardProps) {
  const agentLabel =
    turn.agent_key && turn.agent_key in AGENT_LABELS
      ? AGENT_LABELS[turn.agent_key as AgentKey]
      : turn.agent_key;

  const copyTurn = async () => {
    const text = [
      `You: ${turn.user_message}`,
      turn.assistant_message ? `NexusAI${agentLabel ? ` (${agentLabel})` : ""}: ${turn.assistant_message}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <article className="py-3.5 transition-colors hover:bg-accent/30">
      <div className="px-0">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
              {previewText(turn.user_message, 120)}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{formatRelativeTime(turn.created_at)}</span>
              {turn.session_title && (
                <>
                  <span>·</span>
                  <span className="truncate">{turn.session_title}</span>
                </>
              )}
              {agentLabel && (
                <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                  {agentLabel}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {turn.session_id && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg"
                title="Open chat"
                onClick={onOpenChat}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg"
              title="Copy exchange"
              onClick={copyTurn}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
              title="Delete memory"
              disabled={deleting}
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg"
              title={expanded ? "Collapse" : "Expand"}
              onClick={onToggle}
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {!expanded && turn.assistant_message && (
          <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {previewText(turn.assistant_message, 160)}
          </p>
        )}

        {expanded && (
          <div className="space-y-3 border-t border-border pt-3">
            <div className="flex gap-2">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted/50">
                <User className="h-3 w-3" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">You asked</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{turn.user_message}</p>
              </div>
            </div>
            {turn.assistant_message ? (
              <div className="flex gap-2">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-foreground text-background">
                  <Bot className="h-3 w-3" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    NexusAI replied{agentLabel ? ` · ${agentLabel}` : ""}
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{turn.assistant_message}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No assistant reply saved for this turn.</p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export function ConversationMemoryPanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: turns = [], isLoading } = useQuery({
    queryKey: ["memory-conversations"],
    queryFn: () => apiFetch<ConversationTurn[]>("/api/v1/memory/conversations?limit=40"),
  });

  const deleteTurn = useMutation({
    mutationFn: (turnId: string) =>
      apiFetch<{ deleted: number }>(`/api/v1/memory/turns/${encodeURIComponent(turnId)}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memory-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["memory-entries"] });
      toast.success("Memory deleted");
    },
    onError: (err) => toast.error(formatApiError(err)),
  });

  const clearAll = useMutation({
    mutationFn: () =>
      apiFetch<{ deleted: number }>("/api/v1/memory/conversations", { method: "DELETE" }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["memory-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["memory-entries"] });
      setExpandedId(null);
      toast.success(res.deleted ? `Cleared ${res.deleted} memories` : "No memories to clear");
    },
    onError: (err) => toast.error(formatApiError(err)),
  });

  const filteredTurns = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return turns;
    return turns.filter(
      (turn) =>
        turn.user_message.toLowerCase().includes(q) ||
        (turn.assistant_message?.toLowerCase().includes(q) ?? false) ||
        (turn.session_title?.toLowerCase().includes(q) ?? false) ||
        (turn.agent_key?.toLowerCase().includes(q) ?? false)
    );
  }, [turns, filter]);

  const handleDelete = async (turn: ConversationTurn) => {
    if (!window.confirm("Delete this conversation memory? This cannot be undone.")) return;
    setDeletingId(turn.turn_id);
    try {
      await deleteTurn.mutateAsync(turn.turn_id);
      if (expandedId === turn.turn_id) setExpandedId(null);
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAll = () => {
    if (!window.confirm("Clear all conversation memories? This cannot be undone.")) return;
    clearAll.mutate();
  };

  return (
    <div className="flex flex-col">
      <div className="border-b border-border px-4 py-3.5">
        {turns.length > 0 && (
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by question, answer, chat, or agent…"
                className="h-10 rounded-xl pl-9"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 rounded-lg text-xs"
              disabled={clearAll.isPending}
              onClick={handleClearAll}
            >
              Clear all
            </Button>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-4 py-3.5">
        {isLoading && <p className="text-sm text-muted-foreground">Loading memories…</p>}

        {!isLoading && turns.length === 0 && (
          <div className="py-8 text-center">
            <MessageSquare className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No conversation memories yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Start a chat and NexusAI will remember your exchanges here for future context.
            </p>
            <Button className="mt-4 rounded-lg" size="sm" onClick={() => navigate("/")}>
              Go to Chat
            </Button>
          </div>
        )}

        {!isLoading && turns.length > 0 && filteredTurns.length === 0 && (
          <p className="text-sm text-muted-foreground">No memories match your filter.</p>
        )}

        <div className={cn("divide-y divide-border overflow-y-auto", turns.length > 0 && "max-h-[520px]")}>
          {filteredTurns.map((turn) => (
            <TurnCard
              key={turn.turn_id}
              turn={turn}
              expanded={expandedId === turn.turn_id}
              deleting={deletingId === turn.turn_id}
              onToggle={() =>
                setExpandedId(expandedId === turn.turn_id ? null : turn.turn_id)
              }
              onOpenChat={() => {
                if (turn.session_id) {
                  navigate(`/?session=${turn.session_id}`);
                }
              }}
              onDelete={() => handleDelete(turn)}
            />
          ))}
        </div>

        {turns.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            {filteredTurns.length} of {turns.length} exchange{turns.length === 1 ? "" : "s"} shown
          </p>
        )}
      </div>
    </div>
  );
}
