import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
	Bot,
	Copy,
	Eraser,
	History,
	Loader2,
	Play,
	RotateCcw,
	Share2,
	Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageSection } from "@/components/layout/PageSection";
import { CodeEditor } from "@/components/sandbox/CodeEditor";
import { StackTracePanel } from "@/components/sandbox/StackTracePanel";
import { API_URL, authHeaders } from "@/lib/api";
import {
	clearSandboxHistory,
	loadSandboxHistory,
	pushSandboxHistory,
	type SandboxRunEntry,
} from "@/lib/sandboxHistory";
import { setPendingSandboxFix } from "@/lib/sandboxFixBridge";
import { useThemeStore } from "@/stores/chatStore";
import { toast } from "@/stores/toastStore";

interface SandboxResult {
	stdout: string;
	stderr: string;
	exit_code: number;
	runtime_ms: number;
	sandbox: string;
	language: string;
	blocked?: boolean;
	block_reason?: string | null;
	parsed_trace?: {
		exception_type: string;
		message: string;
		frames: {
			file: string;
			line: number;
			function: string;
			code?: string | null;
		}[];
		root_cause?: string | null;
		summary: string;
	} | null;
}

interface LanguageItem {
	key: string;
	label: string;
	starter_code?: string;
}

function decodeCodeFromParams(searchParams: URLSearchParams): string | null {
	const code64 = searchParams.get("code64");
	if (code64) {
		try {
			return decodeURIComponent(escape(atob(code64)));
		} catch {
			return null;
		}
	}
	return searchParams.get("code");
}

function buildShareUrl(language: string, code: string): string {
	const base = `${window.location.origin}/sandbox`;
	const params = new URLSearchParams({ lang: language });
	if (code.length <= 600) {
		params.set("code", code);
	} else {
		params.set("code64", btoa(unescape(encodeURIComponent(code))));
	}
	return `${base}?${params.toString()}`;
}

export function SandboxPage() {
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const { darkMode } = useThemeStore();
	const [code, setCode] = useState('print("Hello from NexusAI sandbox")');
	const [stdin, setStdin] = useState("");
	const [language, setLanguage] = useState("python");
	const [languages, setLanguages] = useState<LanguageItem[]>([]);
	const [result, setResult] = useState<SandboxResult | null>(null);
	const [running, setRunning] = useState(false);
	const [dockerReady, setDockerReady] = useState<boolean | null>(null);
	const [dockerMessage, setDockerMessage] = useState<string | null>(null);
	const [history, setHistory] = useState<SandboxRunEntry[]>(() =>
		loadSandboxHistory(),
	);
	const [showHistory, setShowHistory] = useState(false);

	const starterMap = useMemo(() => {
		const map: Record<string, string> = {};
		for (const l of languages) {
			if (l.starter_code) map[l.key] = l.starter_code;
		}
		return map;
	}, [languages]);

	useEffect(() => {
		fetch(`${API_URL}/api/v1/sandbox/languages`, { headers: authHeaders() })
			.then((r) => r.json())
			.then((d: { languages: LanguageItem[] }) => setLanguages(d.languages))
			.catch(() =>
				setLanguages([
					{ key: "python", label: "Python", starter_code: 'print("Hello")' },
				]),
			);
	}, []);

	useEffect(() => {
		fetch(`${API_URL}/api/v1/sandbox/status`, { headers: authHeaders() })
			.then((r) => r.json())
			.then((d: { docker_ready: boolean; message: string | null }) => {
				setDockerReady(d.docker_ready);
				setDockerMessage(d.message);
			})
			.catch(() => {
				setDockerReady(false);
				setDockerMessage("Could not check Docker status.");
			});
	}, []);

	useEffect(() => {
		const lang = searchParams.get("lang");
		const codeParam = decodeCodeFromParams(searchParams);
		if (lang) setLanguage(lang);
		if (codeParam) setCode(codeParam);
		if (lang || codeParam) setSearchParams({}, { replace: true });
	}, [searchParams, setSearchParams]);

	const runCode = useCallback(async () => {
		setRunning(true);
		setResult(null);
		try {
			const res = await fetch(`${API_URL}/api/v1/sandbox/execute`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					code,
					language,
					stdin: stdin.trim() || undefined,
				}),
			});
			const data = (await res.json()) as SandboxResult;
			setResult(data);
			setHistory(
				pushSandboxHistory({
					language,
					code,
					stdout: data.stdout,
					stderr: data.stderr,
					exit_code: data.exit_code,
					runtime_ms: data.runtime_ms,
				}),
			);
		} catch (err) {
			setResult({
				stdout: "",
				stderr: err instanceof Error ? err.message : "Execution failed",
				exit_code: 1,
				runtime_ms: 0,
				sandbox: "none",
				language,
			});
		} finally {
			setRunning(false);
		}
	}, [code, language, stdin]);

	const handleLanguageChange = (next: string) => {
		setLanguage(next);
		const starter = starterMap[next];
		if (starter) setCode(starter);
	};

	const resetToStarter = () => {
		setCode(starterMap[language] ?? "");
		setResult(null);
		setStdin("");
	};

	const copyCode = async () => {
		await navigator.clipboard.writeText(code);
		toast.success("Code copied");
	};

	const copyOutput = async () => {
		const text = [result?.stdout, result?.stderr].filter(Boolean).join("\n");
		if (!text) return;
		await navigator.clipboard.writeText(text);
		toast.success("Output copied");
	};

	const shareLink = async () => {
		const url = buildShareUrl(language, code);
		await navigator.clipboard.writeText(url);
		toast.success("Share link copied");
	};

	const askAiToFix = () => {
		if (!result) return;
		setPendingSandboxFix({
			code,
			stderr: result.stderr || result.block_reason || "Execution failed",
			language,
		});
		navigate("/");
	};

	const loadHistoryEntry = (entry: SandboxRunEntry) => {
		setLanguage(entry.language);
		setCode(entry.code);
		setResult({
			stdout: entry.stdout,
			stderr: entry.stderr,
			exit_code: entry.exit_code,
			runtime_ms: entry.runtime_ms,
			sandbox: "docker",
			language: entry.language,
		});
		setShowHistory(false);
	};

	const languageOptions = languages.length
		? languages
		: [{ key: "python", label: "Python" }];

	return (
		<div className="page-shell">
			<PageHeader
				title="Code playground"
				description="Run code in isolated Docker containers — 21 IT languages, no host access."
				action={
					<div className="flex shrink-0 flex-wrap items-center gap-2">
						<select
							value={language}
							onChange={(e) => handleLanguageChange(e.target.value)}
							className="select-field min-w-[8rem]"
						>
							{languageOptions.map((l) => (
								<option key={l.key} value={l.key}>
									{l.label}
								</option>
							))}
						</select>
						<Button
							onClick={runCode}
							disabled={running}
							className="h-9 gap-2 rounded-xl px-4"
						>
							{running ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Play className="h-4 w-4" />
							)}
							Run
						</Button>
					</div>
				}
			/>

			<div className="page-content">
				{dockerReady === false && (
					<div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
						{dockerMessage ||
							"Docker is not running. Start Docker Desktop for fast code execution."}
					</div>
				)}

				<div className="page-grid-2">
					<PageSection
						icon={Terminal}
						title="Editor"
						action={
							<div className="flex flex-wrap gap-1">
								<Button
									variant="ghost"
									size="sm"
									className="h-8 gap-1 px-2 text-xs"
									onClick={copyCode}
								>
									<Copy className="h-3.5 w-3.5" /> Copy
								</Button>
								<Button
									variant="ghost"
									size="sm"
									className="h-8 gap-1 px-2 text-xs"
									onClick={resetToStarter}
								>
									<RotateCcw className="h-3.5 w-3.5" /> Reset
								</Button>
								<Button
									variant="ghost"
									size="sm"
									className="h-8 gap-1 px-2 text-xs"
									onClick={() => {
										setCode("");
										setResult(null);
									}}
								>
									<Eraser className="h-3.5 w-3.5" /> Clear
								</Button>
								<Button
									variant="ghost"
									size="sm"
									className="h-8 gap-1 px-2 text-xs"
									onClick={shareLink}
								>
									<Share2 className="h-3.5 w-3.5" /> Share
								</Button>
								<Button
									variant="ghost"
									size="sm"
									className="h-8 gap-1 px-2 text-xs"
									onClick={() => setShowHistory((v) => !v)}
								>
									<History className="h-3.5 w-3.5" /> History
								</Button>
							</div>
						}
					>
						<div className="space-y-3 px-4 py-3.5">
							{showHistory && (
								<div className="rounded-xl border border-border bg-muted/30 p-3">
									<div className="mb-2 flex items-center justify-between">
										<span className="text-xs font-medium text-muted-foreground">
											Recent runs
										</span>
										<Button
											variant="ghost"
											size="sm"
											className="h-7 text-xs"
											onClick={() => {
												clearSandboxHistory();
												setHistory([]);
											}}
										>
											Clear all
										</Button>
									</div>
									{history.length === 0 ? (
										<p className="text-xs text-muted-foreground">No runs yet</p>
									) : (
										<ul className="max-h-32 space-y-1 overflow-y-auto">
											{history.map((h) => (
												<li key={h.id}>
													<button
														type="button"
														onClick={() => loadHistoryEntry(h)}
														className="w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-accent"
													>
														<span className="font-medium">{h.language}</span>
														<span className="text-muted-foreground">
															{" "}
															· exit {h.exit_code} · {h.runtime_ms}ms
														</span>
													</button>
												</li>
											))}
										</ul>
									)}
								</div>
							)}
							<CodeEditor
								value={code}
								language={language}
								onChange={setCode}
								onRun={runCode}
								darkMode={darkMode}
							/>
							<div>
								<label className="mb-1.5 block text-xs font-medium text-muted-foreground">
									Standard input (optional)
								</label>
								<textarea
									value={stdin}
									onChange={(e) => setStdin(e.target.value)}
									placeholder="Input passed to your program…"
									className="min-h-[72px] w-full resize-y rounded-xl border border-border bg-muted/20 p-3 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
									spellCheck={false}
								/>
							</div>
							<p className="text-[11px] text-muted-foreground">
								Tip: press ⌘/Ctrl + Enter to run
							</p>
						</div>
					</PageSection>

					<PageSection
						icon={Bot}
						title="Output"
						action={
							<div className="flex items-center gap-2">
								{result && (
									<span className="font-mono text-[11px] text-muted-foreground">
										{result.language} · {result.sandbox} · {result.runtime_ms}ms
										· exit {result.exit_code}
									</span>
								)}
								{result && (result.stderr || result.exit_code !== 0) && (
									<Button
										variant="outline"
										size="sm"
										className="h-8 gap-1 rounded-lg text-xs"
										onClick={askAiToFix}
									>
										<Bot className="h-3.5 w-3.5" /> Fix with AI
									</Button>
								)}
								{result && (result.stdout || result.stderr) && (
									<Button
										variant="ghost"
										size="sm"
										className="h-8 gap-1 px-2 text-xs"
										onClick={copyOutput}
									>
										<Copy className="h-3.5 w-3.5" />
									</Button>
								)}
							</div>
						}
					>
						<div className="min-h-[280px] space-y-3 px-4 py-3.5">
							{running && (
								<div className="flex items-center gap-2 text-sm text-muted-foreground">
									<Loader2 className="h-4 w-4 animate-spin" />
									Running…
								</div>
							)}

							{result?.blocked && (
								<div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
									<p className="font-semibold text-amber-800 dark:text-amber-200">
										Execution blocked
									</p>
									<p className="mt-1 text-muted-foreground">
										{result.block_reason || "Unsafe pattern detected"}
									</p>
								</div>
							)}

							{!result && !running && (
								<p className="text-sm text-muted-foreground">
									Output appears here after you run code.
								</p>
							)}

							{result?.parsed_trace && (
								<StackTracePanel trace={result.parsed_trace} />
							)}

							{result && (
								<div className="space-y-3 font-mono text-sm">
									{result.stdout && (
										<pre className="whitespace-pre-wrap rounded-lg bg-muted/30 p-3">
											{result.stdout}
										</pre>
									)}
									{result.stderr && !result.parsed_trace && (
										<pre className="whitespace-pre-wrap rounded-lg bg-destructive/10 p-3 text-destructive">
											{result.stderr}
										</pre>
									)}
									{result.stderr && result.parsed_trace && (
										<details className="text-xs text-muted-foreground">
											<summary className="cursor-pointer">Raw stderr</summary>
											<pre className="mt-2 whitespace-pre-wrap rounded-lg bg-destructive/10 p-3 text-destructive">
												{result.stderr}
											</pre>
										</details>
									)}
									{!result.stdout && !result.stderr && !result.blocked && (
										<p className="text-muted-foreground">No output.</p>
									)}
								</div>
							)}
						</div>
					</PageSection>
				</div>
			</div>
		</div>
	);
}
