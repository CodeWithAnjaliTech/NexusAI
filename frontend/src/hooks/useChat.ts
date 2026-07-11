import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useChatStore, type ChatMode } from "@/stores/chatStore";
import { toast } from "@/stores/toastStore";
import { API_URL, authHeaders } from "@/lib/api";
import type {
	AgentKey,
	ChatMessage,
	FileAttachment,
	GraphEvent,
	Session,
} from "@/types";

interface StreamDoneData {
	message_id: string;
	agent: AgentKey;
	intent: ChatMessage["intent"];
	citations?: ChatMessage["citations"];
	duration_ms?: number;
}

function parseMode(mode: ChatMode): {
	force_agent?: string;
	custom_agent_id?: string;
} {
	if (mode === "auto") return {};
	if (mode.startsWith("custom:")) return { custom_agent_id: mode.slice(7) };
	return { force_agent: mode };
}

export function useChat() {
	const queryClient = useQueryClient();
	const abortRef = useRef<AbortController | null>(null);
	const {
		sessionId,
		projectId,
		messages,
		isLoading,
		graphEvents,
		preferredMode,
		setSessionId,
		setMessages,
		addMessage,
		updateMessage,
		removeLastAssistantMessage,
		setLoading,
		setAgentContext,
		setGraphEvents,
		clearChat,
	} = useChatStore();

	const buildBody = useCallback(
		(messageText: string, attachments?: FileAttachment[]) => {
			const {
				sessionId: currentSessionId,
				projectId: currentProjectId,
				preferredMode: currentMode,
				contextSource: currentContextSource,
				contextDocumentId: currentDocumentId,
			} = useChatStore.getState();

			const body: Record<string, unknown> = {
				message: messageText,
				session_id: currentSessionId,
				stream: true,
				...parseMode(currentMode),
			};
			if (currentProjectId) body.project_id = currentProjectId;
			body.context_source = currentContextSource;

			let documentId: string | undefined;
			if (attachments?.length === 1) {
				documentId = attachments[0].id;
			} else if (
				(currentContextSource === "document" ||
					currentContextSource === "both") &&
				currentDocumentId
			) {
				documentId = currentDocumentId;
			}
			if (documentId) body.document_id = documentId;

			return body;
		},
		[],
	);

	const sendMessage = useCallback(
		async (content: string, attachments?: FileAttachment[]) => {
			const userMsg: ChatMessage = {
				id: crypto.randomUUID(),
				role: "user",
				content: content || (attachments?.length ? "Uploaded file(s)" : ""),
				attachments,
			};
			addMessage(userMsg);
			setLoading(true);
			setGraphEvents([]);

			const assistantId = crypto.randomUUID();
			addMessage({ id: assistantId, role: "assistant", content: "" });

			const messageText =
				content ||
				`Please analyze the uploaded file: ${attachments?.map((a) => a.filename).join(", ")}`;

			abortRef.current = new AbortController();

			try {
				const res = await fetch(`${API_URL}/api/v1/chat/stream`, {
					method: "POST",
					headers: authHeaders(),
					body: JSON.stringify(buildBody(messageText, attachments)),
					signal: abortRef.current.signal,
				});

				if (!res.ok) throw new Error(await res.text());

				const reader = res.body?.getReader();
				if (!reader) throw new Error("No response stream");

				const decoder = new TextDecoder();
				let buffer = "";

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split("\n");
					buffer = lines.pop() || "";

					for (const line of lines) {
						if (!line.startsWith("data: ")) continue;
						try {
							const payload = JSON.parse(line.slice(6)) as {
								event: string;
								data: Record<string, unknown>;
							};

							if (payload.event === "session") {
								setSessionId(payload.data.session_id as string);
							} else if (payload.event === "graph_event") {
								const prev = useChatStore.getState().graphEvents;
								setGraphEvents([
									...prev,
									payload.data as unknown as GraphEvent,
								]);
							} else if (payload.event === "token") {
								const chunk = (payload.data.content as string) || "";
								const current = useChatStore
									.getState()
									.messages.find((m) => m.id === assistantId);
								updateMessage(assistantId, {
									content: (current?.content || "") + chunk,
								});
							} else if (payload.event === "done") {
								const done = payload.data as unknown as StreamDoneData;
								updateMessage(assistantId, {
									id: done.message_id,
									agent: done.agent,
									intent: done.intent,
									citations: done.citations,
								});
								setAgentContext(done.agent, done.intent!);
								queryClient.invalidateQueries({ queryKey: ["sessions"] });
								queryClient.invalidateQueries({
									queryKey: ["analytics-summary"],
								});
								queryClient.invalidateQueries({ queryKey: ["analytics"] });
								queryClient.invalidateQueries({
									queryKey: ["memory-conversations"],
								});
								queryClient.invalidateQueries({ queryKey: ["memory-entries"] });
							} else if (payload.event === "error") {
								const msg = (payload.data.message as string) || "Stream failed";
								updateMessage(assistantId, { content: `Error: ${msg}` });
								toast.error(msg.slice(0, 120));
							}
						} catch {
							// skip malformed lines
						}
					}
				}
			} catch (err) {
				if (err instanceof Error && err.name === "AbortError") {
					updateMessage(assistantId, { content: "Generation stopped." });
					toast.info("Generation stopped");
				} else {
					const detail = err instanceof Error ? err.message : "Unknown error";
					toast.error(detail.slice(0, 120));
					updateMessage(assistantId, {
						content: detail.includes("fetch")
							? "Cannot reach the backend. Is it running on port 8000?"
							: `Error: ${detail.slice(0, 300)}`,
					});
				}
			} finally {
				setLoading(false);
				abortRef.current = null;
			}
		},
		[
			buildBody,
			addMessage,
			updateMessage,
			setLoading,
			setGraphEvents,
			setSessionId,
			setAgentContext,
			queryClient,
		],
	);

	const stopGeneration = useCallback(() => {
		abortRef.current?.abort();
	}, []);

	const regenerateLast = useCallback(async () => {
		const msgs = useChatStore.getState().messages;
		let lastUser: ChatMessage | undefined;
		for (let i = msgs.length - 1; i >= 0; i--) {
			if (msgs[i].role === "user") {
				lastUser = msgs[i];
				break;
			}
		}
		if (!lastUser) return;
		removeLastAssistantMessage();
		await sendMessage(lastUser.content, lastUser.attachments);
	}, [removeLastAssistantMessage, sendMessage]);

	const startNewChat = useCallback(async () => {
		clearChat();
		try {
			const res = await fetch(`${API_URL}/api/v1/sessions`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					title: "New Conversation",
					project_id: projectId || undefined,
				}),
			});
			if (!res.ok) throw new Error(await res.text());
			const session = (await res.json()) as Session;
			setSessionId(session.id);
			queryClient.invalidateQueries({ queryKey: ["sessions"] });
			toast.success("New chat started");
		} catch {
			toast.error("Could not create session");
		}
	}, [clearChat, setSessionId, projectId, queryClient]);

	const loadSession = useCallback(
		async (id: string): Promise<boolean> => {
			setLoading(true);
			try {
				const res = await fetch(`${API_URL}/api/v1/sessions/${id}/messages`, {
					headers: authHeaders(),
				});
				if (!res.ok) throw new Error(await res.text());
				const msgs = (await res.json()) as {
					id: string;
					role: string;
					content: string;
					agent_id: string | null;
					intent: string | null;
					attachments?: FileAttachment[];
					citations?: ChatMessage["citations"];
				}[];

				setSessionId(id);
				setMessages(
					msgs.map((m) => ({
						id: m.id,
						role: m.role as "user" | "assistant",
						content: m.content,
						agent: (m.agent_id as AgentKey) || undefined,
						intent: m.intent as ChatMessage["intent"],
						attachments: m.attachments,
						citations: m.citations,
					})),
				);
				setGraphEvents([]);
				return true;
			} catch (err) {
				clearChat();
				toast.error("Failed to load conversation");
				console.error(err);
				return false;
			} finally {
				setLoading(false);
			}
		},
		[setSessionId, setMessages, setLoading, setGraphEvents, clearChat],
	);

	return {
		messages,
		isLoading,
		graphEvents,
		sessionId,
		projectId,
		preferredMode,
		sendMessage,
		stopGeneration,
		regenerateLast,
		startNewChat,
		loadSession,
		clearChat,
	};
}
