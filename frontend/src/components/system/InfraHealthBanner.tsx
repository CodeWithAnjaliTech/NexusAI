import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Copy, ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { toast } from "@/stores/toastStore";
import { cn } from "@/lib/utils";

export interface HealthStatus {
  status: string;
  checks: Record<string, string>;
  hints?: Record<string, string>;
  required_services?: string[];
  optional_services?: string[];
}

function isOk(status: string) {
  return status === "ok";
}

const SERVICE_LABELS: Record<string, string> = {
  chromadb: "ChromaDB",
  redis: "Redis",
  database: "Database",
  ollama: "Ollama",
  docker: "Docker",
  backend: "Backend",
};

function fixCommand(unavailable: string[]): string | null {
  const dockerServices = unavailable.filter((s) => s === "chromadb" || s === "redis");
  if (dockerServices.length === 0) return null;
  return `docker compose up -d ${dockerServices.join(" ")}`;
}

interface InfraHealthBannerProps {
  compact?: boolean;
  className?: string;
}

export function InfraHealthBanner({ compact = false, className }: InfraHealthBannerProps) {
  const { data: health } = useQuery({
    queryKey: ["health-status"],
    queryFn: () => apiFetch<HealthStatus>("/api/v1/health/status"),
    refetchInterval: 30_000,
  });

  if (!health) return null;

  const issues = Object.entries(health.checks).filter(([, status]) => !isOk(status));
  if (issues.length === 0) {
    if (compact) return null;
    return (
      <div
        className={cn(
          "mb-6 flex items-center gap-3 rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3 text-sm",
          className,
        )}
      >
        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
        <span>All services are running.</span>
        <Button asChild variant="ghost" size="sm" className="ml-auto h-8 rounded-lg text-xs">
          <Link to="/settings">Details</Link>
        </Button>
      </div>
    );
  }

  const required = new Set(health.required_services ?? ["backend", "database", "ollama"]);
  const requiredIssues = issues.filter(([name]) => required.has(name));
  const optionalIssues = issues.filter(([name]) => !required.has(name));
  const unavailableNames = issues.map(([name]) => name);
  const command = fixCommand(unavailableNames);
  const onlyOptional = requiredIssues.length === 0 && optionalIssues.length > 0;

  const copyFixCommand = async () => {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      toast.success("Fix command copied");
    } catch {
      toast.error("Could not copy command");
    }
  };

  return (
    <div
      className={cn(
        "mb-6 rounded-xl border px-4 py-3",
        onlyOptional
          ? "border-amber-500/25 bg-amber-500/5"
          : "border-red-500/25 bg-red-500/5",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0",
            onlyOptional ? "text-amber-600" : "text-red-600",
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {onlyOptional
              ? `Optional services stopped (${optionalIssues.length})`
              : `Core services need attention (${requiredIssues.length})`}
          </p>
          {compact ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {issues
                .map(([name]) => SERVICE_LABELS[name] || name)
                .join(", ")}{" "}
              unavailable
              {onlyOptional
                ? " — Knowledge search and memory cache may be limited."
                : " — chat or review may not work until fixed."}
            </p>
          ) : (
            <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
              {issues.map(([name, status]) => (
                <li key={name}>
                  <span className="font-medium text-foreground">
                    {SERVICE_LABELS[name] || name}
                  </span>
                  : {status}
                  {health.hints?.[name] && (
                    <p className="mt-0.5 leading-relaxed">{health.hints[name]}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {command && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code className="rounded-lg bg-muted/60 px-2 py-1 font-mono text-[11px]">
                {command}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 rounded-lg px-2 text-xs"
                onClick={() => void copyFixCommand()}
              >
                <Copy className="mr-1 h-3 w-3" />
                Copy fix
              </Button>
            </div>
          )}
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0 rounded-lg text-xs">
          <Link to="/settings">
            {onlyOptional ? "Details" : "Fix setup"}
            <ExternalLink className="ml-1.5 h-3 w-3" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
