import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import {
	Code2,
	Download,
	FileSearch,
	Menu,
	MessageCircle,
	PanelLeftOpen,
	PanelRightClose,
	PanelRightOpen,
	Plus,
	Sparkles,
} from "lucide-react";
import { GuestChatBanner } from "@/components/auth/GuestChatBanner";
import { ChatHistorySidebar } from "@/components/chat/ChatHistorySidebar";
import { ChatInput } from "@/components/chat/ChatInput";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { shouldShowCitations } from "@/lib/chatContentUtils";
import { ReasoningTree } from "@/components/graph/ReasoningTree";
import { Button } from "@/components/ui/button";
import { useChat } from "@/hooks/useChat";
import {
	getStoredSessionId,
	useChatStore,
	type ChatMode,
} from "@/stores/chatStore";
import { apiFetch } from "@/lib/api";
import {
	finishSandboxFix,
	hasPendingSandboxFix,
	tryBeginSandboxFix,
	type SandboxFixPayload,
} from "@/lib/sandboxFixBridge";
import {
	AGENT_LABELS,
	AGENT_OPTIONS,
	type Agent,
	type AgentKey,
	type ChatMessage,
	type CustomAgent,
	type Project,
} from "@/types";

const STARTERS = [
	{
		icon: Code2,
		label: "Debug my code",
		message: "Help me debug a Python error in my FastAPI application.",
	},
	{
		icon: FileSearch,
		label: "Search documents",
		message:
			"Search my uploaded documentation and explain the key requirements.",
	},
	{
		icon: Sparkles,
		label: "Research a topic",
		message:
			"Compare microservices vs monolith architecture for a startup MVP.",
	},
	{
		icon: MessageCircle,
		label: "General help",
		message: "What can NexusAI help me with across different work domains?",
	},
];

function precedingUserMessage(messages: ChatMessage[], idx: number): ChatMessage | undefined {
	for (let i = idx - 1; i >= 0; i -= 1) {
		if (messages[i].role === "user") return messages[i];
	}
	return undefined;
}

function usePanelPref(key: string, defaultOpen = true) {
	const [open, setOpen] = useState(() => {
		const stored = localStorage.getItem(key);
		return stored === null ? defaultOpen : stored === "true";
	});

	const toggle = () =>
		setOpen((v) => {
			const next = !v;
			localStorage.setItem(key, String(next));
			return next;
		});

	return { open, toggle };
}

export function ChatPage() {
	const location = useLocation();
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const {
		messages,
		isLoading,
		graphEvents,
		sessionId,
		sendMessage,
		stopGeneration,
		regenerateLast,
		startNewChat,
		loadSession,
	} = useChat();
	const {
		activeAgent,
		preferredMode,
		projectId,
		contextSource,
		contextDocumentId,
		setPreferredMode,
		setProjectId,
		setContextSource,
		setContextDocumentId,
	} = useChatStore();
	const scrollRef = useRef<HTMLDivElement>(null);
	const docHandled = useRef(false);
	const sessionHandled = useRef(false);
	const codeReviewHandled = useRef(false);

	const handleNewChat = async () => {
		setSearchParams(
			(prev) => {
				const next = new URLSearchParams(prev);
				next.delete("session");
				return next;
			},
			{ replace: true },
		);
		await startNewChat();
	};
	const { open: historyOpen, toggle: toggleHistory } = usePanelPref(
		"nexusai-chat-history-open",
		true,
	);
	const { open: reasoningOpen, toggle: toggleReasoning } = usePanelPref(
		"nexusai-chat-reasoning-open",
		false,
	);
	const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);

	const { data: agents = [] } = useQuery({
		queryKey: ["agents"],
		queryFn: () => apiFetch<Agent[]>("/api/v1/agents"),
	});

	const { data: customAgents = [] } = useQuery({
		queryKey: ["custom-agents"],
		queryFn: () => apiFetch<CustomAgent[]>("/api/v1/custom-agents"),
	});

	const { data: projects = [] } = useQuery({
		queryKey: ["projects"],
		queryFn: () => apiFetch<Project[]>("/api/v1/projects"),
	});

	const modeOptions = useMemo(() => {
		const opts: { value: ChatMode; label: string }[] = AGENT_OPTIONS.map(
			({ key, label }) => ({
				value: key,
				label,
			}),
		);
		for (const c of customAgents) {
			opts.push({ value: `custom:${c.id}`, label: c.name });
		}
		for (const a of agents) {
			if (!opts.some((o) => o.value === a.agent_key)) {
				opts.push({ value: a.agent_key as ChatMode, label: a.name });
			}
		}
		return opts;
	}, [agents, customAgents]);

	const thinkingAgent = useMemo((): AgentKey | null => {
		if (preferredMode !== "auto" && !preferredMode.startsWith("custom:")) {
			return preferredMode as AgentKey;
		}
		return activeAgent;
	}, [preferredMode, activeAgent]);

	const scrollRafRef = useRef<number | null>(null);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el || messages.length === 0) return;

		if (scrollRafRef.current != null) {
			cancelAnimationFrame(scrollRafRef.current);
		}

		scrollRafRef.current = requestAnimationFrame(() => {
			el.scrollTop = el.scrollHeight;
			scrollRafRef.current = null;
		});

		return () => {
			if (scrollRafRef.current != null) {
				cancelAnimationFrame(scrollRafRef.current);
			}
		};
	}, [messages, isLoading]);

	useEffect(() => {
		if (docHandled.current) return;
		const docId = searchParams.get("doc");
		if (!docId) return;
		docHandled.current = true;
		const docName = searchParams.get("name");
		setSearchParams(
			(prev) => {
				const next = new URLSearchParams(prev);
				next.delete("doc");
				next.delete("name");
				return next;
			},
			{ replace: true },
		);
		setContextSource("document");
		setContextDocumentId(docId);
		sendMessage(
			`Please analyze and answer questions about my document: ${docName || "uploaded file"}`,
			[
				{
					id: docId,
					filename: docName || "document",
					mime_type: "application/octet-stream",
					file_size: 0,
					status: "indexed",
				},
			],
		);
	}, [searchParams, setSearchParams, sendMessage, setContextSource, setContextDocumentId]);

	useEffect(() => {
		if (sessionHandled.current) return;
		sessionHandled.current = true;

		const navState = location.state as {
			sandboxFix?: unknown;
			codeReviewContext?: unknown;
		} | null;
		if (
			navState?.sandboxFix ||
			navState?.codeReviewContext ||
			hasPendingSandboxFix()
		) {
			return;
		}

		const sessionParam = searchParams.get("session");
		const storedId = getStoredSessionId();
		const targetId = sessionParam || storedId;
		if (!targetId) return;

		const { sessionId: activeId, messages: activeMessages } =
			useChatStore.getState();
		if (activeId === targetId && activeMessages.length > 0) {
			if (!sessionParam) {
				setSearchParams(
					(prev) => {
						const next = new URLSearchParams(prev);
						next.set("session", targetId);
						return next;
					},
					{ replace: true },
				);
			}
			return;
		}

		void loadSession(targetId).then((ok) => {
			if (!ok) {
				setSearchParams(
					(prev) => {
						const next = new URLSearchParams(prev);
						next.delete("session");
						return next;
					},
					{ replace: true },
				);
				return;
			}
			setSearchParams(
				(prev) => {
					const next = new URLSearchParams(prev);
					next.set("session", targetId);
					return next;
				},
				{ replace: true },
			);
		});
	}, [loadSession, searchParams, setSearchParams, location.state]);

	useEffect(() => {
		if (!sessionId) return;

		if (searchParams.get("session") === sessionId) return;
		setSearchParams(
			(prev) => {
				const next = new URLSearchParams(prev);
				next.set("session", sessionId);
				return next;
			},
			{ replace: true },
		);
	}, [sessionId, searchParams, setSearchParams]);

	useEffect(() => {
		const fix =
			tryBeginSandboxFix() ??
			(
				location.state as { sandboxFix?: SandboxFixPayload } | null
			)?.sandboxFix;
		if (!fix) return;

		void (async () => {
			try {
				setSearchParams(
					(prev) => {
						const next = new URLSearchParams(prev);
						next.delete("session");
						return next;
					},
					{ replace: true },
				);
				setPreferredMode("code_sandbox");
				await startNewChat();
				const msg = `Help me fix this ${fix.language} code:\n\n\`\`\`${fix.language}\n${fix.code}\n\`\`\`\n\nError output:\n\`\`\`\n${fix.stderr}\n\`\`\``;
				await sendMessage(msg);
			} finally {
				finishSandboxFix();
				navigate(".", { replace: true, state: null });
			}
		})();
	}, [
		location.state,
		sendMessage,
		setPreferredMode,
		startNewChat,
		setSearchParams,
		navigate,
	]);

	useEffect(() => {
		if (codeReviewHandled.current) return;
		const ctx = (
			location.state as { codeReviewContext?: { message: string } } | null
		)?.codeReviewContext;
		if (!ctx?.message) return;
		codeReviewHandled.current = true;
		navigate(".", { replace: true, state: null });

		void (async () => {
			setSearchParams(
				(prev) => {
					const next = new URLSearchParams(prev);
					next.delete("session");
					return next;
				},
				{ replace: true },
			);
			await startNewChat();
			await sendMessage(ctx.message);
		})();
	}, [location.state, sendMessage, startNewChat, setSearchParams, navigate]);

	const exportChat = () => {
		if (!sessionId) return;
		window.open(
			`${import.meta.env.VITE_API_URL || "http://localhost:8000"}/api/v1/sessions/${sessionId}/export`,
			"_blank",
		);
	};

	return (
		<div className="flex h-full min-h-0 flex-1 overflow-hidden bg-background">
			{historyOpen && (
				<div className="hidden h-full shrink-0 md:flex">
					<ChatHistorySidebar
						activeSessionId={sessionId}
						projectId={projectId}
						onSelectSession={loadSession}
						onNewChat={handleNewChat}
						onCollapse={toggleHistory}
					/>
				</div>
			)}

			{!historyOpen && (
				<div className="hidden h-full w-10 shrink-0 flex-col items-center border-r border-border bg-card/30 pt-3 md:flex">
					<Button
						variant="ghost"
						size="icon"
						className="h-9 w-9"
						onClick={toggleHistory}
						title="Show history"
					>
						<PanelLeftOpen className="h-4 w-4" />
					</Button>
				</div>
			)}

			<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
				<header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-4 sm:px-5">
					<div className="flex min-w-0 items-center gap-2">
						<Button
							variant="ghost"
							size="icon"
							className="h-8 w-8 shrink-0 md:hidden"
							onClick={() => setMobileHistoryOpen((v) => !v)}
							title="Toggle history"
						>
							<Menu className="h-4 w-4" />
						</Button>
						<div className="min-w-0">
							<h1 className="truncate text-sm font-semibold leading-none sm:text-base">
								Chat
							</h1>
							<p className="mt-0.5 hidden truncate text-[11px] text-muted-foreground lg:block">
								Ask anything — NexusAI picks the right specialist
							</p>
						</div>
					</div>

					<div className="flex shrink-0 items-center gap-2 sm:gap-3">
						<label className="hidden h-9 items-center gap-2 sm:flex">
							<span className="shrink-0 text-xs text-muted-foreground">
								Project
							</span>
							<select
								value={projectId ?? ""}
								onChange={(e) => setProjectId(e.target.value || null)}
								disabled={isLoading}
								className="select-field w-[7.5rem] lg:w-[8.75rem]"
							>
								<option value="">None</option>
								{projects.map((p) => (
									<option key={p.id} value={p.id}>
										{p.name}
									</option>
								))}
							</select>
						</label>

						<label className="flex h-9 items-center gap-2">
							<span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
								Mode
							</span>
							<select
								value={preferredMode}
								onChange={(e) => setPreferredMode(e.target.value as ChatMode)}
								disabled={isLoading}
								className="select-field w-[9.5rem] sm:w-[11.5rem]"
							>
								{modeOptions.map(({ value, label }) => (
									<option key={value} value={value}>
										{label}
									</option>
								))}
							</select>
						</label>

						<Button
							variant="outline"
							size="sm"
							className="h-8 gap-1 rounded-lg px-2.5 text-xs sm:px-3"
							onClick={() => handleNewChat()}
							disabled={isLoading}
						>
							<Plus className="h-3.5 w-3.5" />
							<span className="hidden sm:inline">New chat</span>
						</Button>

						{sessionId && (
							<Button
								variant="ghost"
								size="icon"
								className="hidden h-8 w-8 rounded-lg sm:inline-flex"
								onClick={exportChat}
								title="Export chat"
							>
								<Download className="h-3.5 w-3.5" />
							</Button>
						)}

						{activeAgent && (
							<span className="hidden h-8 items-center rounded-full bg-muted px-2.5 text-[11px] font-medium xl:inline-flex">
								{AGENT_LABELS[activeAgent as AgentKey]}
							</span>
						)}

						<Button
							variant="ghost"
							size="icon"
							className="hidden h-8 w-8 lg:inline-flex"
							onClick={toggleReasoning}
							title={reasoningOpen ? "Hide reasoning" : "Show reasoning"}
						>
							{reasoningOpen ? (
								<PanelRightClose className="h-4 w-4" />
							) : (
								<PanelRightOpen className="h-4 w-4" />
							)}
						</Button>
					</div>
				</header>

				<GuestChatBanner />

				{mobileHistoryOpen && (
					<div className="max-h-48 overflow-y-auto border-b border-border md:hidden">
						<ChatHistorySidebar
							activeSessionId={sessionId}
							projectId={projectId}
							onSelectSession={(id) => {
								loadSession(id);
								setMobileHistoryOpen(false);
							}}
							onNewChat={() => {
								void handleNewChat();
								setMobileHistoryOpen(false);
							}}
						/>
					</div>
				)}

				<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
					<div
						ref={scrollRef}
						className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain scrollbar-thin"
					>
						{messages.length === 0 ? (
							<div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
								<div className="flex flex-col items-center text-center">
									<div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background">
										<span className="text-sm font-bold">N</span>
									</div>
									<h2 className="text-lg font-semibold tracking-tight sm:text-xl">
										How can I help today?
									</h2>
									<p className="mt-2 max-w-sm text-sm text-muted-foreground">
										Code, specs, docs, research, or everyday questions.
									</p>
									<div className="mt-8 grid w-full max-w-md gap-2 sm:grid-cols-2">
										{STARTERS.map(({ icon: Icon, label, message }) => (
											<button
												key={label}
												type="button"
												onClick={() => sendMessage(message)}
												disabled={isLoading}
												className="flex h-10 items-center gap-2 rounded-lg border border-border/60 px-3 text-left text-sm transition-colors hover:bg-muted/50"
											>
												<Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
												<span>{label}</span>
											</button>
										))}
									</div>
								</div>
							</div>
						) : (
							<div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-4 sm:px-6">
								{messages.map((msg, idx) => {
									const userMsg =
										msg.role === "assistant"
											? precedingUserMessage(messages, idx)
											: undefined;
									const isLastAssistantStreaming =
										isLoading &&
										msg.role === "assistant" &&
										idx === messages.length - 1;

									return (
										<MessageBubble
											key={msg.id}
											message={msg}
											isLoading={isLoading}
											isStreaming={isLastAssistantStreaming}
											graphEvents={
												isLastAssistantStreaming ? graphEvents : undefined
											}
											thinkingAgent={
												isLastAssistantStreaming ? thinkingAgent : undefined
											}
											showCitations={shouldShowCitations(
												msg.citations,
												userMsg?.content,
												userMsg?.attachments,
												contextSource,
												contextDocumentId,
											)}
											onRegenerate={
												msg.role === "assistant" &&
												idx === messages.length - 1 &&
												!isLoading
													? regenerateLast
													: undefined
											}
										/>
									);
								})}
							</div>
						)}
					</div>

					<div className="shrink-0 border-t border-border/40 bg-background">
						<ChatInput
							onSend={sendMessage}
							onStop={stopGeneration}
							isLoading={isLoading}
						/>
					</div>
				</div>
			</div>

			{reasoningOpen && (
				<div className="hidden h-full w-64 shrink-0 flex-col border-l border-border bg-background lg:flex xl:w-72">
					<div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
						<div>
							<h2 className="text-xs font-semibold leading-none">Reasoning</h2>
							<p className="mt-0.5 text-[10px] text-muted-foreground">
								Routing & steps
							</p>
						</div>
						<Button
							variant="ghost"
							size="icon"
							className="h-8 w-8 shrink-0"
							onClick={toggleReasoning}
							title="Hide reasoning"
						>
							<PanelRightClose className="h-4 w-4" />
						</Button>
					</div>
					<div className="min-h-0 flex-1 overflow-hidden">
						<ReasoningTree events={graphEvents} />
					</div>
				</div>
			)}
		</div>
	);
}
