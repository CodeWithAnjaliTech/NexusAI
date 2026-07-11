import { useCallback, useEffect, useState, type InputHTMLAttributes } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
	AlertTriangle,
	CheckCircle2,
	FileArchive,
	FolderOpen,
	Github,
	GraduationCap,
	Loader2,
	MessageSquare,
	Upload,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageCollapsible, PageSection } from "@/components/layout/PageSection";
import { ExperienceLevelPicker } from "@/components/codeReview/ExperienceLevelPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { API_URL, apiFetch, authHeaders, formatApiError } from "@/lib/api";
import {
	EXPERIENCE_LEVELS,
	experienceLevelLabel,
	loadExperienceLevel,
	saveExperienceLevel,
	type ExperienceLevel,
} from "@/lib/codeReviewLevels";
import {
	formatGithubRepoRef,
	githubRepoRefError,
	initialGithubRepoRef,
	isValidGithubRepoRef,
} from "@/lib/githubRepoUtils";
import {
	filterProjectFiles,
	getProjectNameFromFiles,
} from "@/lib/projectReviewUtils";
import { toast } from "@/stores/toastStore";
import { cn } from "@/lib/utils";
import type {
	CodeReviewReport,
	GitHubReviewSources,
	ReviewFinding,
	Severity,
} from "@/types/codeReview";

const SEVERITY_STYLE: Record<Severity, string> = {
	critical: "bg-red-600 text-white",
	high: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
	medium:
		"bg-amber-500/15 text-amber-800 dark:text-amber-400 border-amber-500/30",
	low: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
	info: "bg-muted text-muted-foreground border-border",
};

function ScoreRing({ score }: { score: number }) {
	const color =
		score >= 80
			? "text-emerald-600"
			: score >= 60
				? "text-amber-600"
				: "text-red-600";
	return (
		<div className={cn("flex flex-col items-center", color)}>
			<span className="text-4xl font-bold tabular-nums">{score}</span>
			<span className="text-xs text-muted-foreground">/ 100</span>
		</div>
	);
}

function FindingRow({ finding }: { finding: ReviewFinding }) {
	return (
		<div className="rounded-lg border border-border bg-background/50 p-3">
			<div className="mb-1.5 flex flex-wrap items-center gap-2">
				<span
					className={cn(
						"rounded border px-1.5 py-px text-[10px] font-semibold uppercase",
						SEVERITY_STYLE[finding.severity],
					)}
				>
					{finding.severity}
				</span>
				<span className="text-sm font-medium">{finding.title}</span>
				{finding.file && (
					<span className="truncate font-mono text-[10px] text-muted-foreground">
						{finding.file}
					</span>
				)}
			</div>
			<p className="text-xs leading-relaxed text-muted-foreground">
				{finding.description}
			</p>
			<p className="mt-2 text-xs leading-relaxed">
				<span className="font-medium text-foreground">Suggestion: </span>
				{finding.suggestion}
			</p>
		</div>
	);
}

export function CodeReviewPage() {
	const navigate = useNavigate();
	const [uploading, setUploading] = useState(false);
	const [progress, setProgress] = useState(0);
	const [dragOver, setDragOver] = useState(false);
	const [report, setReport] = useState<CodeReviewReport | null>(null);
	const [branch, setBranch] = useState("main");
	const [repoRef, setRepoRef] = useState("");
	const [repoInitialized, setRepoInitialized] = useState(false);
	const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>(
		loadExperienceLevel,
	);

	const handleExperienceLevel = (level: ExperienceLevel) => {
		setExperienceLevel(level);
		saveExperienceLevel(level);
	};

	const [uploadMode, setUploadMode] = useState<
		"zip" | "folder" | "github" | null
	>(null);
	const [sourceTab, setSourceTab] = useState<"github" | "local">("github");

	const { data: githubSources, isLoading: githubLoading } = useQuery({
		queryKey: ["code-review-github-sources", repoRef],
		queryFn: () => {
			const qs = isValidGithubRepoRef(repoRef)
				? `?repo_url=${encodeURIComponent(repoRef)}`
				: "";
			return apiFetch<GitHubReviewSources>(
				`/api/v1/code-review/github-sources${qs}`,
			);
		},
	});

	useEffect(() => {
		if (!githubSources || repoInitialized) return;
		setRepoRef(
			initialGithubRepoRef(
				githubSources.repo_full_name,
				githubSources.repo_url,
			),
		);
		setRepoInitialized(true);
	}, [githubSources, repoInitialized]);

	useEffect(() => {
		if (githubSources?.default_branch) {
			setBranch(githubSources.default_branch);
		}
	}, [githubSources?.default_branch]);

	const githubReady = Boolean(githubSources?.connected);

	const repoValidationError = githubRepoRefError(repoRef);

	const postReviewForm = useCallback(
		(url: string, form: FormData) =>
			new Promise<CodeReviewReport>((resolve, reject) => {
				const xhr = new XMLHttpRequest();
				xhr.open("POST", url);
				const headers = authHeaders(false);
				Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
				xhr.upload.onprogress = (e) => {
					if (e.lengthComputable)
						setProgress(Math.round((e.loaded / e.total) * 100));
				};
				xhr.onload = () => {
					if (xhr.status >= 200 && xhr.status < 300) {
						resolve(JSON.parse(xhr.responseText) as CodeReviewReport);
					} else {
						let detail = xhr.responseText;
						try {
							const parsed = JSON.parse(xhr.responseText) as {
								detail?: string;
							};
							detail = parsed.detail ?? detail;
						} catch {
							/* keep raw */
						}
						reject(new Error(detail || `Review failed (${xhr.status})`));
					}
				};
				xhr.onerror = () =>
					reject(new Error(formatApiError(new TypeError("Failed to fetch"))));
				xhr.send(form);
			}),
		[],
	);

	const analyzeGitHub = useCallback(async () => {
		const repoError = githubRepoRefError(repoRef);
		if (repoError) {
			toast.error(repoError);
			return;
		}

		setUploading(true);
		setUploadMode("github");
		setProgress(0);
		setReport(null);

		try {
			const result = await apiFetch<CodeReviewReport>(
				"/api/v1/code-review/analyze-github",
				{
					method: "POST",
					body: JSON.stringify({
						repo_url: formatGithubRepoRef(repoRef),
						branch: branch.trim() || undefined,
						experience_level: experienceLevel,
					}),
				},
			);
			setReport(result);
			toast.success("GitHub code review complete");
		} catch (err) {
			toast.error(formatApiError(err));
		} finally {
			setUploading(false);
			setUploadMode(null);
			setProgress(0);
		}
	}, [branch, experienceLevel, repoRef]);

	const analyzeZip = useCallback(
		async (file: File) => {
			if (!file.name.toLowerCase().endsWith(".zip")) {
				toast.error("Please upload a .zip file");
				return;
			}
			setUploading(true);
			setUploadMode("zip");
			setProgress(0);
			setReport(null);

			try {
				const form = new FormData();
				form.append("file", file);
				form.append("experience_level", experienceLevel);
				const result = await postReviewForm(
					`${API_URL}/api/v1/code-review/analyze`,
					form,
				);
				setReport(result);
				toast.success("Code review complete");
			} catch (err) {
				toast.error(formatApiError(err));
			} finally {
				setUploading(false);
				setUploadMode(null);
				setProgress(0);
			}
		},
		[experienceLevel, postReviewForm],
	);

	const analyzeFolder = useCallback(
		async (files: FileList | File[]) => {
			const filtered = filterProjectFiles(files);
			if (filtered.length === 0) {
				toast.error(
					"No reviewable source files found. Pick your project folder (not node_modules).",
				);
				return;
			}

			setUploading(true);
			setUploadMode("folder");
			setProgress(0);
			setReport(null);

			try {
				const paths = filtered.map((f) => f.webkitRelativePath || f.name);
				const form = new FormData();
				form.append("paths", JSON.stringify(paths));
				form.append("project_name", getProjectNameFromFiles(filtered));
				form.append("experience_level", experienceLevel);
				filtered.forEach((f) => form.append("files", f));

				const result = await postReviewForm(
					`${API_URL}/api/v1/code-review/analyze-folder`,
					form,
				);
				setReport(result);
				toast.success(`Reviewed ${filtered.length} source files`);
			} catch (err) {
				toast.error(formatApiError(err));
			} finally {
				setUploading(false);
				setUploadMode(null);
				setProgress(0);
			}
		},
		[experienceLevel, postReviewForm],
	);

	const handleZipFiles = (files: FileList | null) => {
		if (files?.[0]) void analyzeZip(files[0]);
	};

	const handleFolderFiles = (files: FileList | null) => {
		if (files && files.length > 0) void analyzeFolder(files);
	};

	const discussInChat = () => {
		if (!report) return;
		const summary = [
			`Please help me address this code review for project "${report.project_name}" (score ${report.overall_score}/100, ${experienceLevelLabel(report.experience_level ?? experienceLevel)} level).`,
			report.summary,
			"",
			"Top priorities:",
			...report.priorities.map((p, i) => `${i + 1}. ${p}`),
		].join("\n");
		navigate("/", {
			state: { codeReviewContext: { message: summary, report } },
		});
	};

	const repoLabel = formatGithubRepoRef(repoRef) || "your repository";
	const repoPlaceholder = githubSources?.username
		? `${githubSources.username}/your-repo`
		: "owner/repo";
	const suggestedRepo = githubSources?.username
		? `${githubSources.username}/cashflow-tracker`
		: null;
	const selectedLevel =
		EXPERIENCE_LEVELS.find((l) => l.value === experienceLevel) ??
		EXPERIENCE_LEVELS[1];

	return (
		<div className="page-shell">
			<PageHeader
				title="Code review"
				description="AI-powered review tuned to your level — security, quality, tests, and architecture."
				action={
					<ExperienceLevelPicker
						compact
						value={experienceLevel}
						onChange={handleExperienceLevel}
						disabled={uploading}
					/>
				}
			/>

			<div className="page-content space-y-6">
				<PageSection
					title="Start a review"
					description={`${selectedLevel.label} feedback · GitHub (recommended) or local upload`}
					bodyClassName="p-0"
				>
					<div className="flex border-b border-border px-2 pt-2">
						<button
							type="button"
							onClick={() => setSourceTab("github")}
							className={cn(
								"flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors",
								sourceTab === "github"
									? "bg-background text-foreground shadow-[inset_0_-1px_0_0_hsl(var(--background))]"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							<Github className="h-4 w-4" />
							GitHub
							{githubReady && (
								<span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
									Connected
								</span>
							)}
						</button>
						<button
							type="button"
							onClick={() => setSourceTab("local")}
							className={cn(
								"flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors",
								sourceTab === "local"
									? "bg-background text-foreground shadow-[inset_0_-1px_0_0_hsl(var(--background))]"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							<Upload className="h-4 w-4" />
							Upload local
						</button>
					</div>

					{sourceTab === "github" ? (
						githubLoading ? (
							<div className="flex items-center gap-2 px-5 py-10 text-sm text-muted-foreground">
								<Loader2 className="h-4 w-4 animate-spin" />
								Checking GitHub connection…
							</div>
						) : githubReady ? (
							<div className="space-y-4 px-5 py-5">
								<div className="flex flex-col gap-3 lg:flex-row lg:items-end">
									<div className="min-w-0 flex-1 space-y-1.5">
										<label
											htmlFor="review-repo"
											className="text-xs font-medium text-muted-foreground"
										>
											Repository
										</label>
										<Input
											id="review-repo"
											value={repoRef}
											onChange={(e) => setRepoRef(e.target.value)}
											disabled={uploading}
											placeholder={repoPlaceholder}
											className={cn(
												"h-10 font-mono",
												repoValidationError &&
													repoRef.trim() &&
													"border-amber-500/60 focus-visible:ring-amber-500/30",
											)}
										/>
									</div>

									<div className="w-full space-y-1.5 lg:w-36 lg:shrink-0">
										<label
											htmlFor="review-branch"
											className="text-xs font-medium text-muted-foreground"
										>
											Branch
										</label>
										{githubSources?.branches?.length ? (
											<select
												id="review-branch"
												value={branch}
												onChange={(e) => setBranch(e.target.value)}
												disabled={uploading}
												className="select-field h-10 w-full"
											>
												{(githubSources?.branches ?? []).map((b) => (
													<option key={b} value={b}>
														{b}
													</option>
												))}
											</select>
										) : (
											<Input
												id="review-branch"
												value={branch}
												onChange={(e) => setBranch(e.target.value)}
												disabled={uploading}
												placeholder="main"
												className="h-10"
											/>
										)}
									</div>

									<Button
										onClick={() => void analyzeGitHub()}
										disabled={uploading || Boolean(repoValidationError)}
										className="h-10 w-full shrink-0 rounded-xl lg:w-auto lg:min-w-[11rem]"
									>
										{uploading && uploadMode === "github" ? (
											<>
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
												Reviewing…
											</>
										) : (
											<>
												<Github className="mr-2 h-4 w-4" />
												Review repository
											</>
										)}
									</Button>
								</div>

								<div className="space-y-1 text-xs text-muted-foreground">
									{repoValidationError && repoRef.trim() ? (
										<p className="text-amber-700 dark:text-amber-300">
											{repoValidationError}
										</p>
									) : (
										<p>
											{githubSources?.username
												? `Signed in as ${githubSources.username} · format owner/repo`
												: "Example: CodeWithAnjaliTech/cashflow-tracker"}
										</p>
									)}
									{repoValidationError && suggestedRepo && (
										<button
											type="button"
											className="font-medium text-foreground underline-offset-2 hover:underline"
											onClick={() => setRepoRef(suggestedRepo)}
										>
											Use {suggestedRepo}
										</button>
									)}
									{!uploading && (
										<p className="text-[11px]">
											Server-side download · skips node_modules · no zip upload
											limit
										</p>
									)}
								</div>

								{githubSources?.error && !repoValidationError && (
									<p className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
										{githubSources.error}
									</p>
								)}

								{uploading && uploadMode === "github" ? (
									<div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
										<div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
											<span className="flex items-center gap-1.5">
												<Loader2 className="h-3.5 w-3.5 animate-spin" />
												Analyzing {repoLabel} ({branch})
											</span>
											<span>~30–90s</span>
										</div>
										<div className="h-1 overflow-hidden rounded-full bg-muted">
											<div className="h-full w-2/3 animate-pulse rounded-full bg-foreground/70" />
										</div>
										<p className="mt-2 text-[11px] text-muted-foreground">
											Downloading from GitHub, then running AI review at{" "}
											{selectedLevel.label.toLowerCase()} depth.
										</p>
									</div>
								) : null}
							</div>
						) : (
							<div className="space-y-4 px-5 py-8 text-center">
								<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-muted/30">
									<Github className="h-5 w-5" />
								</div>
								<div className="space-y-1">
									<p className="text-sm font-medium">Connect GitHub first</p>
									<p className="mx-auto max-w-sm text-xs text-muted-foreground">
										Add a personal access token and repo in Settings to review
										without uploading files.
									</p>
								</div>
								<Button variant="outline" size="sm" asChild className="rounded-lg">
									<Link to="/settings">Open Settings</Link>
								</Button>
							</div>
						)
					) : (
						<div
							className={cn(dragOver && "bg-muted/20")}
							onDrop={(e) => {
								e.preventDefault();
								setDragOver(false);
								handleZipFiles(e.dataTransfer.files);
							}}
							onDragOver={(e) => {
								e.preventDefault();
								setDragOver(true);
							}}
							onDragLeave={() => setDragOver(false)}
						>
							<div className="grid gap-0 md:grid-cols-2 md:divide-x md:divide-border">
								<div className="flex flex-col gap-3 px-5 py-5">
									<div className="flex items-start gap-3">
										<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40">
											<FileArchive className="h-4 w-4" />
										</div>
										<div>
											<p className="text-sm font-semibold">Zip archive</p>
											<p className="text-xs text-muted-foreground">
												Max 50MB · exclude node_modules
											</p>
										</div>
									</div>
									<label className="block">
										<div className="flex min-h-[7rem] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/10 px-4 py-6 text-center transition-colors hover:bg-muted/25">
											<p className="text-xs text-muted-foreground">
												Drop .zip here or click to browse
											</p>
										</div>
										<input
											type="file"
											accept=".zip,application/zip"
											className="hidden"
											disabled={uploading}
											onChange={(e) => handleZipFiles(e.target.files)}
										/>
									</label>
								</div>

								<div className="flex flex-col gap-3 border-t border-border px-5 py-5 md:border-t-0">
									<div className="flex items-start gap-3">
										<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40">
											<FolderOpen className="h-4 w-4" />
										</div>
										<div>
											<p className="text-sm font-semibold">Project folder</p>
											<p className="text-xs text-muted-foreground">
												Best for monorepos · auto-skips heavy dirs
											</p>
										</div>
									</div>
									<label className="block">
										<div className="flex min-h-[7rem] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/10 px-4 py-6 text-center transition-colors hover:bg-muted/25">
											<p className="text-xs text-muted-foreground">
												Select your project root folder
											</p>
										</div>
										<input
											type="file"
											className="hidden"
											disabled={uploading}
											multiple
											{...({
												webkitdirectory: "",
												directory: "",
											} as InputHTMLAttributes<HTMLInputElement>)}
											onChange={(e) => handleFolderFiles(e.target.files)}
										/>
									</label>
								</div>
							</div>

							{uploading && uploadMode !== "github" && (
								<div className="border-t border-border px-5 py-4">
									<div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
										<span className="flex items-center gap-1.5">
											<Loader2 className="h-3 w-3 animate-spin" />
											{uploadMode === "zip"
												? "Analyzing zip…"
												: "Uploading source files…"}
										</span>
										<span>{progress}%</span>
									</div>
									<div className="h-1.5 overflow-hidden rounded-full bg-muted">
										<div
											className="h-full rounded-full bg-foreground transition-all"
											style={{ width: `${progress}%` }}
										/>
									</div>
								</div>
							)}
						</div>
					)}
				</PageSection>

				<PageCollapsible title="Tips & limits">
					<ul className="list-disc space-y-1.5 pl-4 text-sm text-muted-foreground">
						<li>
							<strong className="font-medium text-foreground">GitHub</strong>{" "}
							avoids browser upload limits and excludes node_modules automatically.
						</li>
						<li>
							<strong className="font-medium text-foreground">
								{selectedLevel.label} level
							</strong>{" "}
							— {selectedLevel.description.toLowerCase()}
						</li>
						<li>
							Reviews scan up to 80 source files · large zips? Use folder upload
							or GitHub.
						</li>
						<li>
							Fix Settings repo URL to{" "}
							<code className="text-foreground">owner/repo</code> (not username
							only) for Chat context too.
						</li>
					</ul>
				</PageCollapsible>

				{report && (
					<div className="space-y-6">
						<Card className="surface-card shadow-none">
							<CardContent className="flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:justify-between">
								<div className="flex items-center gap-5">
									<ScoreRing score={report.overall_score} />
									<div>
										<h2 className="text-lg font-semibold">
											{report.project_name}
										</h2>
										{report.review_source?.type === "github" && (
											<p className="text-xs text-muted-foreground">
												<Github className="mr-1 inline h-3 w-3" />
												{report.review_source.full_name} · branch{" "}
												{report.review_source.branch}
											</p>
										)}
										{report.experience_level && (
											<p className="text-xs text-muted-foreground">
												<GraduationCap className="mr-1 inline h-3 w-3" />
												Review for{" "}
												{experienceLevelLabel(report.experience_level)} level
											</p>
										)}
										<p className="mt-1 text-sm text-muted-foreground">
											{report.summary}
										</p>
										<p className="mt-2 text-xs text-muted-foreground">
											{report.stats.code_files} files ·{" "}
											{report.stats.total_lines.toLocaleString()} lines ·{" "}
											{report.stats.languages.join(", ") || "mixed"}
											{report.stats.frameworks.length > 0 &&
												` · ${report.stats.frameworks.join(", ")}`}
											{" · "}
											{(report.duration_ms / 1000).toFixed(1)}s
										</p>
									</div>
								</div>
								<Button onClick={discussInChat} className="shrink-0 rounded-xl">
									<MessageSquare className="mr-2 h-4 w-4" />
									Discuss in Chat
								</Button>
							</CardContent>
						</Card>

						{(report.strengths.length > 0 || report.priorities.length > 0) && (
							<div className="page-grid-2">
								{report.strengths.length > 0 && (
									<Card className="surface-card shadow-none">
										<CardHeader className="pb-2">
											<CardTitle className="flex items-center gap-2 text-sm font-semibold">
												<CheckCircle2 className="h-4 w-4 text-emerald-600" />
												Strengths
											</CardTitle>
										</CardHeader>
										<CardContent>
											<ul className="space-y-1.5 text-sm text-muted-foreground">
												{report.strengths.map((s, i) => (
													<li key={i}>• {s}</li>
												))}
											</ul>
										</CardContent>
									</Card>
								)}
								{report.priorities.length > 0 && (
									<Card className="surface-card shadow-none">
										<CardHeader className="pb-2">
											<CardTitle className="flex items-center gap-2 text-sm font-semibold">
												<AlertTriangle className="h-4 w-4 text-amber-600" />
												Top priorities
											</CardTitle>
										</CardHeader>
										<CardContent>
											<ol className="list-decimal space-y-1.5 pl-4 text-sm text-muted-foreground">
												{report.priorities.map((p, i) => (
													<li key={i}>{p}</li>
												))}
											</ol>
										</CardContent>
									</Card>
								)}
							</div>
						)}

						<div className="space-y-4">
							<h3 className="text-sm font-semibold">Findings by category</h3>
							{report.categories.map((cat) => (
								<Card key={cat.name} className="surface-card shadow-none">
									<CardHeader className="pb-2">
										<div className="flex items-center justify-between gap-2">
											<CardTitle className="text-sm font-semibold">
												{cat.name}
											</CardTitle>
											<span className="text-xs font-medium text-muted-foreground">
												Score: {cat.score}/100
											</span>
										</div>
									</CardHeader>
									<CardContent className="space-y-2">
										{cat.findings.length === 0 ? (
											<p className="text-xs text-muted-foreground">
												No issues found in this category.
											</p>
										) : (
											cat.findings.map((f, i) => (
												<FindingRow key={i} finding={f} />
											))
										)}
									</CardContent>
								</Card>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
