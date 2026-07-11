import { useQuery } from "@tanstack/react-query";
import {
	BarChart3,
	Brain,
	Database,
	FolderKanban,
	MessageSquare,
	Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
	MetricCard,
	MetricGrid,
	NavRow,
	PageEmpty,
	PageSection,
} from "@/components/layout/PageSection";
import { InfraHealthBanner } from "@/components/system/InfraHealthBanner";
import { Button } from "@/components/ui/button";
import { documentsQueryKey } from "@/components/knowledge/documentUtils";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useChatStore } from "@/stores/chatStore";
import { Link } from "react-router-dom";

interface AnalyticsSummary {
	total_requests_today: number;
	success_rate_today: number;
	agents: { agent_key: string; invocations: number }[];
}

interface Project {
	id: string;
	name: string;
}

interface SessionSummary {
	id: string;
	title: string;
	updated_at: string;
}

function getGreeting(): string {
	const hour = new Date().getHours();
	if (hour < 12) return "Good morning";
	if (hour < 17) return "Good afternoon";
	return "Good evening";
}

function formatSessionTime(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso.slice(0, 16);

	const diffMs = Date.now() - date.getTime();
	const diffMins = Math.floor(diffMs / 60_000);
	if (diffMins < 1) return "Just now";
	if (diffMins < 60) return `${diffMins}m ago`;
	const diffHours = Math.floor(diffMins / 60);
	if (diffHours < 24) return `${diffHours}h ago`;
	return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function DashboardPage() {
	const projectId = useChatStore((s) => s.projectId);
	const user = useAuthStore((s) => s.user);
	const firstName = user?.display_name?.split(/\s+/)[0] || "there";

	const { data: analytics } = useQuery({
		queryKey: ["analytics-summary"],
		queryFn: () => apiFetch<AnalyticsSummary>("/api/v1/analytics/summary"),
	});

	const { data: projects = [] } = useQuery({
		queryKey: ["projects"],
		queryFn: () => apiFetch<Project[]>("/api/v1/projects"),
	});

	const { data: sessions = [] } = useQuery({
		queryKey: ["sessions-recent"],
		queryFn: () => apiFetch<SessionSummary[]>("/api/v1/sessions?limit=5"),
	});

	const { data: documents = [] } = useQuery({
		queryKey: documentsQueryKey(projectId),
		queryFn: () => {
			const q = projectId ? `?project_id=${projectId}` : "";
			return apiFetch<{ id: string; filename: string; status: string }[]>(
				`/api/v1/documents${q}`,
			);
		},
	});

	const failedDocs = documents.filter(
		(d) => d.status === "failed" || d.status === "stored",
	);

	return (
		<div className="page-shell">
			<PageHeader
				title="Workspace"
				description="Your AI command center — projects, conversations, knowledge, and agent performance at a glance."
			/>

			<div className="page-content">
				<div className="surface-card relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-muted/50 via-card to-card p-5 sm:p-6">
					<div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-foreground/[0.03]" />
					<div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div className="space-y-1">
							<p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
								{getGreeting()}
							</p>
							<h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
								Welcome back, {firstName}
							</h2>
							<p className="max-w-md text-sm leading-relaxed text-muted-foreground">
								Pick up where you left off or start something new with your agents.
							</p>
						</div>
						<Button asChild className="shrink-0 rounded-xl shadow-sm">
							<Link to="/">
								<MessageSquare className="mr-2 h-4 w-4" />
								New chat
							</Link>
						</Button>
					</div>
				</div>

				<InfraHealthBanner compact />

				<MetricGrid className="xl:grid-cols-4">
					<MetricCard
						icon={Sparkles}
						label="Agent requests"
						value={analytics?.total_requests_today?.toLocaleString() ?? "—"}
					/>
					<MetricCard
						icon={BarChart3}
						label="Success rate"
						value={
							analytics?.success_rate_today != null
								? `${Math.round(analytics.success_rate_today)}%`
								: "—"
						}
					/>
					<MetricCard
						icon={FolderKanban}
						label="Projects"
						value={String(projects.length)}
					/>
					<MetricCard
						icon={Database}
						label="Documents"
						value={String(documents.length)}
					/>
				</MetricGrid>

				<PageSection icon={Sparkles} title="Quick actions">
					<div className="divide-y divide-border">
						<NavRow
							to="/"
							icon={MessageSquare}
							title="New chat"
							hint="Start a fresh conversation"
						/>
						<NavRow
							to="/knowledge"
							icon={Database}
							title="Upload docs"
							hint="Add files to your knowledge base"
						/>
						<NavRow
							to="/memory"
							icon={Brain}
							title="Memory"
							hint="Search and manage stored context"
						/>
						<NavRow
							to="/analytics"
							icon={BarChart3}
							title="Analytics"
							hint="Agent metrics and usage trends"
						/>
					</div>
				</PageSection>

				<PageSection
					icon={MessageSquare}
					title="Recent conversations"
					description={
						sessions.length ? `${sessions.length} recent` : undefined
					}
				>
					{sessions.length === 0 ? (
						<PageEmpty>
							<div className="flex flex-col items-center gap-3 py-3">
								<div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-muted/40">
									<MessageSquare className="h-5 w-5 text-muted-foreground" />
								</div>
								<div className="space-y-1 text-center">
									<p className="font-medium text-foreground">No conversations yet</p>
									<p className="text-xs">Start a chat and your recent threads will appear here.</p>
								</div>
								<Button asChild size="sm" variant="outline" className="rounded-lg">
									<Link to="/">Start chatting</Link>
								</Button>
							</div>
						</PageEmpty>
					) : (
						<div className="divide-y divide-border">
							{sessions.slice(0, 5).map((s) => (
								<NavRow
									key={s.id}
									to="/"
									icon={MessageSquare}
									title={s.title || "Untitled"}
									hint={formatSessionTime(s.updated_at)}
								/>
							))}
						</div>
					)}
				</PageSection>

				{failedDocs.length > 0 && (
					<div className="surface-card flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm shadow-none">
						<p>
							<span className="font-medium">
								{failedDocs.length} document(s)
							</span>{" "}
							need indexing (ChromaDB may be offline or OCR required).
						</p>
						<Button asChild variant="outline" size="sm" className="rounded-lg">
							<Link to="/knowledge">Review in Knowledge</Link>
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
