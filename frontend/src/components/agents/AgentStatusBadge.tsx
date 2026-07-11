import { cn } from "@/lib/utils";

interface AgentStatusBadgeProps {
  name: string;
  status: string;
  isActive?: boolean;
}

export function AgentStatusBadge({ name, status, isActive }: AgentStatusBadgeProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs",
        isActive ? "border-foreground bg-muted" : "border-border bg-background"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full bg-foreground",
          status === "active" && "animate-pulse",
          status !== "active" && "opacity-30"
        )}
      />
      <span className="truncate font-medium">{name}</span>
      <span className="capitalize text-muted-foreground">{status}</span>
    </div>
  );
}
