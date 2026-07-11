import { useQuery } from "@tanstack/react-query";
import {
	Activity,
	BarChart3,
	BookOpen,
	CheckCircle2,
	Code2,
	FileText,
	Search,
	Sparkles,
	Terminal,
	Timer,
	XCircle,
} from "lucide-react";
import { apiFetch, formatApiError } from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageEmpty, PageSection } from "@/components/layout/PageSection";
import { cn } from "@/lib/utils";
import { AGENT_LABELS, type AgentKey } from "@/types";

interface DailyMetric {
	date: string;
	requests: number;
	successes: number;
	failures: number;
}

interface AnalyticsSummary {
	total_requests_today: number;
	successes_today: number;
	failures_today: number;
	success_rate_today: number;
	agents: { agent_key: string; invocations: number; avg_duration_ms: number }[];
	daily_trend: DailyMetric[];
	sandbox: {
		runs_today: number;
		successes_today: number;
		failures_today: number;
	};
	generated_at: string;
}

const AGENT_ICONS: Record<
	AgentKey,
	React.ComponentType<{ className?: string }>
> = {
	code_sandbox: Code2,
	blueprint: FileText,
	documentation: BookOpen,
	research: Search,
	general: Sparkles,
};

const CHART_HEIGHT = 96;

function formatMs(ms: number): string {
	if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
	return `${Math.round(ms)}ms`;
}

function TodayOverview({ data }: { data: AnalyticsSummary }) {
	const items = [
		{
			label: "Requests",
			value: data.total_requests_today,
			icon: Activity,
			tone: "default" as const,
		},
		{
			label: "Success rate",
			value: `${data.success_rate_today}%`,
			icon: CheckCircle2,
			tone:
				data.success_rate_today >= 95
					? "good"
					: data.failures_today > 0
						? "warn"
						: "default",
		},
		{
			label: "Successes",
			value: data.successes_today,
			icon: CheckCircle2,
			tone: "good" as const,
		},
		{
			label: "Failures",
			value: data.failures_today,
			icon: XCircle,
			tone: data.failures_today > 0 ? "bad" : "default",
		},
		{
			label: "Sandbox",
			value: data.sandbox.runs_today,
			sub: `${data.sandbox.successes_today} ok · ${data.sandbox.failures_today} fail`,
			icon: Terminal,
			tone: "default" as const,
		},
	];

	return (
		<div className="surface-card overflow-hidden rounded-xl border border-border bg-card shadow-none">
			<div className="grid grid-cols-2 divide-x divide-y divide-border lg:grid-cols-5 lg:divide-y-0">
				{items.map(({ label, value, sub, icon: Icon, tone }) => (
					<div key={label} className="flex items-center gap-3 px-4 py-4">
						<div
							className={cn(
								"flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
								tone === "good" &&
									"border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400",
								tone === "bad" &&
									"border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
								tone === "warn" &&
									"border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
								tone === "default" &&
									"border-border bg-muted/40 text-foreground",
							)}
						>
							<Icon className="h-4 w-4" />
						</div>
						<div className="min-w-0">
							<p className="text-[11px] text-muted-foreground">{label}</p>
							<p className="text-lg font-semibold tabular-nums leading-tight">
								{value}
							</p>
							{sub && (
								<p className="text-[10px] text-muted-foreground">{sub}</p>
							)}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

function TrendChart({ data }: { data: DailyMetric[] }) {
	const max = Math.max(...data.map((d) => d.requests), 1);
	const weekTotal = data.reduce((sum, d) => sum + d.requests, 0);

	return (
		<div className="px-4 py-4">
			<div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
				<span>
					<span className="font-medium text-foreground">{weekTotal}</span>{" "}
					requests this week
				</span>
				<div className="flex items-center gap-4">
					<span className="flex items-center gap-1.5">
						<span className="h-2 w-2 rounded-sm bg-foreground/80" />
						Success
					</span>
					<span className="flex items-center gap-1.5">
						<span className="h-2 w-2 rounded-sm bg-red-500/70" />
						Failed
					</span>
				</div>
			</div>

			<div
				className="flex items-end gap-1.5 sm:gap-2"
				style={{ height: CHART_HEIGHT + 36 }}
			>
				{data.map((d) => {
					const barHeight = d.requests
						? Math.max((d.requests / max) * CHART_HEIGHT, 10)
						: 4;
					const failHeight = d.requests
						? (d.failures / d.requests) * barHeight
						: 0;
					const successHeight = Math.max(barHeight - failHeight, 0);

					return (
						<div
							key={d.date}
							className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
						>
							<span
								className={cn(
									"text-[10px] font-medium tabular-nums",
									d.requests ? "text-foreground" : "text-muted-foreground/50",
								)}
							>
								{d.requests || "—"}
							</span>
							<div
								className="flex w-full max-w-12 flex-col justify-end overflow-hidden rounded-md"
								style={{ height: CHART_HEIGHT }}
								title={`${d.date}: ${d.requests} requests (${d.successes} ok, ${d.failures} fail)`}
							>
								{d.requests === 0 ? (
									<div className="mx-auto h-1 w-3/4 rounded-full bg-muted" />
								) : (
									<>
										{successHeight > 0 && (
											<div
												className="w-full bg-foreground/85 transition-all"
												style={{ height: successHeight }}
											/>
										)}
										{failHeight > 0 && (
											<div
												className="w-full bg-red-500/75 transition-all"
												style={{ height: failHeight }}
											/>
										)}
									</>
								)}
							</div>
							<span className="text-[10px] tabular-nums text-muted-foreground">
								{d.date.slice(5)}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function AgentPerformanceTable({
	agents,
	maxInv,
}: {
	agents: AnalyticsSummary["agents"];
	maxInv: number;
}) {
	if (agents.length === 0)
		return <PageEmpty>No agent runs recorded yet.</PageEmpty>;

	return (
		<>
			<div className="hidden border-b border-border px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[minmax(0,1.4fr)_5rem_5rem_minmax(6rem,1fr)] sm:gap-4">
				<span>Agent</span>
				<span className="text-right">Runs</span>
				<span className="text-right">Avg</span>
				<span>Volume</span>
			</div>
			<div className="divide-y divide-border">
				{agents.map((a) => {
					const key = a.agent_key as AgentKey;
					const Icon = AGENT_ICONS[key] ?? Sparkles;
					const pct = Math.round((a.invocations / maxInv) * 100);

					return (
						<div
							key={a.agent_key}
							className="px-4 py-3.5 sm:grid sm:grid-cols-[minmax(0,1.4fr)_5rem_5rem_minmax(6rem,1fr)] sm:items-center sm:gap-4"
						>
							<div className="flex min-w-0 items-center gap-3">
								<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
									<Icon className="h-4 w-4" />
								</div>
								<p className="truncate text-sm font-semibold">
									{AGENT_LABELS[key] ?? a.agent_key}
								</p>
							</div>
							<p className="mt-1 text-sm tabular-nums text-foreground sm:mt-0 sm:text-right">
								{a.invocations}
							</p>
							<p className="text-xs tabular-nums text-muted-foreground sm:text-right">
								{formatMs(a.avg_duration_ms)}
							</p>
							<div className="mt-2 flex items-center gap-2 sm:mt-0">
								<div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
									<div
										className="h-full rounded-full bg-foreground/75 transition-all"
										style={{ width: `${pct}%` }}
									/>
								</div>
								<span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
									{pct}%
								</span>
							</div>
						</div>
					);
				})}
			</div>
		</>
	);
}

export function AnalyticsPage() {
	const { data, isLoading, error } = useQuery({
		queryKey: ["analytics"],
		queryFn: () => apiFetch<AnalyticsSummary>("/api/v1/analytics/summary"),
		refetchInterval: 30000,
	});

	const maxInv = data
		? Math.max(...data.agents.map((x) => x.invocations), 1)
		: 1;

	return (
		<div className="page-shell">
			<PageHeader
				title="Analytics"
				description="Agent metrics, request volume, sandbox runs, and latency."
				action={
					data ? (
						<span className="flex items-center gap-1.5 text-xs text-muted-foreground">
							<Timer className="h-3.5 w-3.5" />
							{new Date(data.generated_at).toLocaleString()}
						</span>
					) : undefined
				}
			/>

			<div className="page-content">
				{isLoading && (
					<p className="text-sm text-muted-foreground">Loading metrics…</p>
				)}
				{error && (
					<p className="text-sm text-destructive">{formatApiError(error)}</p>
				)}

				{data && (
					<>
						<TodayOverview data={data} />

						<div className="page-grid-2">
							<PageSection
								icon={BarChart3}
								title="7-day trend"
								description="Request volume by day"
							>
								<TrendChart data={data.daily_trend} />
							</PageSection>

							<PageSection
								icon={BarChart3}
								title="Agent performance"
								description={
									data.agents.length
										? `${data.agents.length} active · ${data.agents.reduce((s, a) => s + a.invocations, 0)} total runs`
										: "No activity yet"
								}
							>
								<AgentPerformanceTable agents={data.agents} maxInv={maxInv} />
							</PageSection>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
