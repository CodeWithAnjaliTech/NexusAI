import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
	Activity,
	Bot,
	Github,
	Monitor,
	Palette,
	Server,
	Shield,
} from "lucide-react";
import { PageHeader, ThemeToggle } from "@/components/layout/PageHeader";
import {
	PageEmpty,
	PageRow,
	PageSection,
} from "@/components/layout/PageSection";
import { type HealthStatus } from "@/components/system/InfraHealthBanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useThemeStore } from "@/stores/chatStore";
import { apiFetch, formatApiError } from "@/lib/api";
import { githubRepoRefError } from "@/lib/githubRepoUtils";
import { toast } from "@/stores/toastStore";
import { cn } from "@/lib/utils";

interface LlmConfig {
	provider: string;
	default_provider?: string;
	user_provider?: string | null;
	user_model?: string | null;
	active_model: string;
	ollama_model: string;
	ollama_base_url: string;
	openai_model: string | null;
	openai_configured: boolean;
	anthropic_model: string | null;
	anthropic_configured: boolean;
	groq_model: string | null;
	groq_configured: boolean;
	available_providers?: string[];
}

interface GitHubSettings {
	connected: boolean;
	username: string | null;
	repo_url: string | null;
}

const SERVICE_LABELS: Record<string, string> = {
	database: "Database",
	chromadb: "ChromaDB",
	redis: "Redis",
	ollama: "Ollama",
	docker: "Docker",
	backend: "Backend",
};

function StatusDot({ status }: { status: string }) {
	const ok = status === "ok";
	return (
		<span
			className={cn(
				"inline-block h-1.5 w-1.5 shrink-0 rounded-full",
				ok
					? "bg-green-500"
					: status === "unavailable"
						? "bg-amber-500"
						: "bg-destructive",
			)}
		/>
	);
}

export function SettingsPage() {
	const { darkMode } = useThemeStore();
	const queryClient = useQueryClient();
	const [ghToken, setGhToken] = useState("");
	const [ghRepo, setGhRepo] = useState("");
	const [ghConnecting, setGhConnecting] = useState(false);

	const { data: llmConfig } = useQuery({
		queryKey: ["llm-config"],
		queryFn: () => apiFetch<LlmConfig>("/api/v1/config/llm"),
	});

	const llmMutation = useMutation({
		mutationFn: (body: { provider?: string; model?: string }) =>
			apiFetch<LlmConfig>("/api/v1/config/llm", {
				method: "PATCH",
				body: JSON.stringify(body),
			}),
		onSuccess: () => {
			toast.success("Model preferences saved");
			queryClient.invalidateQueries({ queryKey: ["llm-config"] });
		},
		onError: (err) => toast.error(formatApiError(err)),
	});

	const [selectedProvider, setSelectedProvider] = useState("");
	const [selectedModel, setSelectedModel] = useState("");

	const { data: health, isLoading: healthLoading } = useQuery({
		queryKey: ["health-status"],
		queryFn: () => apiFetch<HealthStatus>("/api/v1/health/status"),
		refetchInterval: 60_000,
	});

	const { data: github } = useQuery({
		queryKey: ["github-settings"],
		queryFn: () => apiFetch<GitHubSettings>("/api/v1/integrations/github"),
	});

	const { data: auditLogs = [] } = useQuery({
		queryKey: ["audit"],
		queryFn: () =>
			apiFetch<{ action: string; resource_type: string; created_at: string }[]>(
				"/api/v1/audit",
			),
	});

	const connectGitHub = async () => {
		if (!ghToken.trim()) {
			toast.error("Enter a GitHub personal access token");
			return;
		}
		if (ghRepo.trim()) {
			const repoError = githubRepoRefError(ghRepo);
			if (repoError) {
				toast.error(repoError);
				return;
			}
		}
		setGhConnecting(true);
		try {
			await apiFetch<GitHubSettings>("/api/v1/integrations/github/connect", {
				method: "POST",
				body: JSON.stringify({ token: ghToken, repo_url: ghRepo || null }),
			});
			toast.success("GitHub connected");
			setGhToken("");
			queryClient.invalidateQueries({ queryKey: ["github-settings"] });
		} catch (err) {
			toast.error(formatApiError(err));
		} finally {
			setGhConnecting(false);
		}
	};

	const disconnectGitHub = async () => {
		try {
			await apiFetch("/api/v1/integrations/github/disconnect", {
				method: "POST",
			});
			toast.success("GitHub disconnected");
			queryClient.invalidateQueries({ queryKey: ["github-settings"] });
		} catch (err) {
			toast.error(formatApiError(err));
		}
	};

	const healthIssues = health
		? Object.entries(health.checks).filter(([, status]) => status !== "ok")
		: [];

	return (
		<div className="page-shell">
			<PageHeader
				title="Settings"
				description="Preferences, integrations, and system status."
			/>

			<div className="page-content">
				<PageSection
					icon={Shield}
					title="System health"
					description="Core services NexusAI depends on."
				>
					<div className="border-b border-border px-4 py-3">
						{healthLoading && (
							<p className="text-sm text-muted-foreground">
								Checking services…
							</p>
						)}
						{health && (
							<div className="flex flex-wrap items-center gap-2">
								<span
									className={cn(
										"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
										health.status === "healthy"
											? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400"
											: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
									)}
								>
									<StatusDot
										status={health.status === "healthy" ? "ok" : "error"}
									/>
									{health.status === "healthy"
										? "All systems operational"
										: "Degraded"}
								</span>
								{Object.entries(health.checks).map(([name, status]) => (
									<span
										key={name}
										className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs capitalize text-muted-foreground"
									>
										<StatusDot status={status} />
										{SERVICE_LABELS[name] || name.replace("_", " ")}
									</span>
								))}
							</div>
						)}
					</div>
					{health?.hints && healthIssues.length > 0 && (
						<div className="space-y-2 px-4 py-3 text-xs text-muted-foreground">
							<p className="font-medium text-foreground">How to fix</p>
							{healthIssues.map(([name]) =>
								health.hints?.[name] ? (
									<p key={name}>
										<span className="font-medium capitalize text-foreground">
											{SERVICE_LABELS[name] || name}:
										</span>{" "}
										{health.hints[name]}
									</p>
								) : null,
							)}
							<p className="pt-1">
								Or run{" "}
								<code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
									./scripts/check-health.sh
								</code>
							</p>
						</div>
					)}
				</PageSection>

				<div className="page-grid-2">
					<PageSection icon={Palette} title="General">
						<PageRow
							label="Theme"
							hint={darkMode ? "Dark mode enabled" : "Light mode enabled"}
						>
							<ThemeToggle />
						</PageRow>
						<PageRow
							label="API endpoint"
							hint="Frontend connection to the NexusAI backend"
							border={false}
						>
							<code className="inline-block max-w-full truncate rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs">
								{import.meta.env.VITE_API_URL || "http://localhost:8000"}
							</code>
						</PageRow>
					</PageSection>

					<PageSection
						icon={Github}
						title="GitHub"
						description="Repo context for code-related chats."
					>
						{github?.connected ? (
							<div className="space-y-3 px-4 py-3.5">
								<p className="text-sm">
									Connected as{" "}
									<span className="font-medium">{github.username}</span>
									{github.repo_url && (
										<span className="mt-1 block truncate font-mono text-xs text-muted-foreground">
											{github.repo_url}
										</span>
									)}
								</p>
								<Button
									variant="outline"
									size="sm"
									className="rounded-lg"
									onClick={disconnectGitHub}
								>
									Disconnect
								</Button>
							</div>
						) : (
							<div className="space-y-3 px-4 py-3.5">
								<Input
									type="password"
									placeholder="GitHub personal access token (ghp_…)"
									value={ghToken}
									onChange={(e) => setGhToken(e.target.value)}
									className="h-10 rounded-xl"
								/>
								<Input
									placeholder="owner/repo (e.g. CodeWithAnjaliTech/cashflow-tracker)"
									value={ghRepo}
									onChange={(e) => setGhRepo(e.target.value)}
									className="h-10 rounded-xl font-mono"
								/>
								<Button
									size="sm"
									className="rounded-lg"
									disabled={ghConnecting}
									onClick={connectGitHub}
								>
									{ghConnecting ? "Connecting…" : "Connect GitHub"}
								</Button>
							</div>
						)}
					</PageSection>
				</div>

				<PageSection
					icon={Bot}
					title="AI models"
					description="Choose provider and override the default model."
				>
					<PageRow label="Active model">
						<span className="text-sm font-medium">
							{llmConfig?.active_model || "llama3.2"}
						</span>
					</PageRow>
					<div className="space-y-3 border-b border-border px-4 py-3.5">
						<div className="grid gap-3 sm:grid-cols-2">
							<div>
								<label className="mb-1.5 block text-xs font-medium text-muted-foreground">
									Provider
								</label>
								<select
									className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
									value={
										selectedProvider ||
										llmConfig?.user_provider ||
										llmConfig?.provider ||
										"ollama"
									}
									onChange={(e) => setSelectedProvider(e.target.value)}
								>
									{(llmConfig?.available_providers || ["ollama"]).map((p) => (
										<option key={p} value={p}>
											{p}
										</option>
									))}
								</select>
							</div>
							<div>
								<label className="mb-1.5 block text-xs font-medium text-muted-foreground">
									Model override
								</label>
								<Input
									placeholder={
										(selectedProvider || llmConfig?.provider) === "openai"
											? llmConfig?.openai_model || "gpt-4o-mini"
											: (selectedProvider || llmConfig?.provider) ===
												  "anthropic"
												? llmConfig?.anthropic_model || "claude-3-5-haiku"
												: (selectedProvider || llmConfig?.provider) === "groq"
													? llmConfig?.groq_model || "llama-3.3-70b-versatile"
													: llmConfig?.ollama_model || "llama3.2"
									}
									value={selectedModel || llmConfig?.user_model || ""}
									onChange={(e) => setSelectedModel(e.target.value)}
									className="h-10 rounded-xl"
								/>
							</div>
						</div>
						<Button
							size="sm"
							className="rounded-lg"
							disabled={llmMutation.isPending}
							onClick={() => {
								const body: { provider?: string; model?: string } = {
									provider:
										selectedProvider ||
										llmConfig?.user_provider ||
										llmConfig?.provider,
								};
								if (selectedModel !== "") body.model = selectedModel;
								llmMutation.mutate(body);
							}}
						>
							{llmMutation.isPending ? "Saving…" : "Save preferences"}
						</Button>
					</div>
					<div className="grid gap-1 px-4 py-3 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-5">
						<p>
							<span className="text-foreground">Server default:</span>{" "}
							{llmConfig?.default_provider || llmConfig?.provider || "—"}
						</p>
						<p>
							<span className="text-foreground">Ollama:</span>{" "}
							{llmConfig?.ollama_model} @ {llmConfig?.ollama_base_url}
						</p>
						<p>
							<span className="text-foreground">Groq:</span>{" "}
							{llmConfig?.groq_configured
								? llmConfig.groq_model
								: "not configured"}
						</p>
						<p>
							<span className="text-foreground">OpenAI:</span>{" "}
							{llmConfig?.openai_configured
								? llmConfig.openai_model
								: "not configured"}
						</p>
						<p>
							<span className="text-foreground">Anthropic:</span>{" "}
							{llmConfig?.anthropic_configured
								? llmConfig.anthropic_model
								: "not configured"}
						</p>
					</div>
				</PageSection>

				<div className="page-grid-2">
					<PageSection icon={Activity} title="Audit log">
						{auditLogs.length === 0 ? (
							<PageEmpty>No recent activity yet.</PageEmpty>
						) : (
							<ul className="max-h-52 divide-y divide-border overflow-y-auto">
								{auditLogs.slice(0, 12).map((log, i) => (
									<li
										key={i}
										className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs"
									>
										<span className="font-medium capitalize text-foreground">
											{log.action}
										</span>
										<span className="truncate text-muted-foreground">
											{log.resource_type}
										</span>
										<span className="shrink-0 tabular-nums text-muted-foreground">
											{log.created_at.slice(11, 16)}
										</span>
									</li>
								))}
							</ul>
						)}
					</PageSection>

					<PageSection icon={Server} title="Developer">
						<PageRow label="Guest access">
							<span className="text-sm text-muted-foreground">
								Chat only — sign in to unlock all features
							</span>
						</PageRow>
						<PageRow label="Environment" border={false}>
							<span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
								<Monitor className="h-3.5 w-3.5" />
								Local development
							</span>
						</PageRow>
					</PageSection>
				</div>
			</div>
		</div>
	);
}
