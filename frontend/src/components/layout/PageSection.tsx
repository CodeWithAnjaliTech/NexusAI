import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageSection({
  icon: Icon,
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
              <Icon className="h-4 w-4 text-foreground" />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{title}</h2>
            {description && (
              <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {action}
      </div>
      <div
        className={cn(
          "surface-card overflow-hidden rounded-xl border border-border bg-card shadow-none",
          bodyClassName
        )}
      >
        {children}
      </div>
    </section>
  );
}

export function PageRow({
  label,
  hint,
  children,
  border = true,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  border?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between",
        border && "border-b border-border last:border-b-0"
      )}
    >
      <div className="min-w-0 shrink-0 sm:max-w-[45%]">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      </div>
      <div className="min-w-0 flex-1 sm:text-right">{children}</div>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="surface-card flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-none transition-all duration-200 hover:border-foreground/10 hover:shadow-sm">
      {Icon && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/30">
          <Icon className="h-4 w-4 text-foreground" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
        {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

export function MetricGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5",
        className
      )}
    >
      {children}
    </div>
  );
}

export function PageEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 py-5 text-center text-sm text-muted-foreground">{children}</p>
  );
}

export function NavRow({
  to,
  icon: Icon,
  title,
  hint,
  external,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  external?: boolean;
}) {
  const content = (
    <>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
        <Icon className="h-4 w-4 text-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </>
  );

  const className =
    "group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-accent/50";

  if (external) {
    return (
      <a href={to} className={className} target="_blank" rel="noreferrer">
        {content}
      </a>
    );
  }

  return (
    <Link to={to} className={className}>
      {content}
    </Link>
  );
}

export function PageCollapsible({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="group rounded-xl border border-border bg-muted/20" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <span className="text-muted-foreground">{title}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        {children}
      </div>
    </details>
  );
}
