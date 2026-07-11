import {
  BookOpen,
  Code2,
  FileText,
  MessageSquare,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AGENT_LABELS, type Agent, type AgentKey } from "@/types";

const AGENT_ICONS: Record<AgentKey, React.ComponentType<{ className?: string }>> = {
  code_sandbox: Code2,
  blueprint: FileText,
  documentation: BookOpen,
  research: Search,
  general: Sparkles,
};

interface AgentRowProps {
  agent: Agent;
  selected?: boolean;
  onUse: () => void;
}

export function AgentRow({ agent, selected, onUse }: AgentRowProps) {
  const key = agent.agent_key as AgentKey;
  const Icon = AGENT_ICONS[key] ?? Sparkles;
  const isOnline = agent.status === "active";

  return (
    <div
      className={cn(
        "flex flex-col gap-3 px-4 py-3.5 transition-colors sm:flex-row sm:items-center sm:justify-between",
        selected && "bg-muted/40"
      )}
    >
      <div className="flex min-w-0 flex-1 gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border",
            selected ? "bg-foreground text-background" : "bg-muted/40 text-foreground"
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{agent.name}</h3>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                isOnline
                  ? "bg-green-500/10 text-green-700 dark:text-green-400"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  isOnline ? "bg-green-500" : "bg-muted-foreground"
                )}
              />
              {agent.status}
            </span>
            {selected && (
              <span className="rounded-full border border-foreground bg-foreground px-2 py-0.5 text-[10px] font-medium text-background">
                In chat
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{agent.description}</p>
          {agent.capabilities.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {agent.capabilities.map((cap) => (
                <span
                  key={cap}
                  className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[11px] text-muted-foreground"
                >
                  {cap}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <Button
        size="sm"
        variant={selected ? "default" : "outline"}
        className="shrink-0 rounded-lg sm:ml-2"
        onClick={onUse}
      >
        <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
        Use in Chat
      </Button>
    </div>
  );
}

interface CustomAgentRowProps {
  id: string;
  name: string;
  baseAgentKey: string;
  systemPrompt: string;
  onUse: () => void;
  onDelete: () => void;
}

export function CustomAgentRow({
  name,
  baseAgentKey,
  systemPrompt,
  onUse,
  onDelete,
}: CustomAgentRowProps) {
  const baseLabel = AGENT_LABELS[baseAgentKey as AgentKey] ?? baseAgentKey;

  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">{name}</h3>
          <span className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[11px] text-muted-foreground">
            Based on {baseLabel}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {systemPrompt}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" className="rounded-lg" onClick={onUse}>
          <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
          Use in Chat
        </Button>
        <Button size="sm" variant="ghost" className="rounded-lg" onClick={onDelete} title="Delete">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
