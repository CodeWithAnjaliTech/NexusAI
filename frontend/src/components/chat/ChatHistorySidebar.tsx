import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	MessageSquare,
	PanelLeftClose,
	Pencil,
	Plus,
	Search,
	Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { toast } from "@/stores/toastStore";
import { cn } from "@/lib/utils";
import type { Session } from "@/types";

interface ChatHistorySidebarProps {
	activeSessionId: string | null;
	projectId?: string | null;
	onSelectSession: (id: string) => void;
	onNewChat: () => void;
	onCollapse?: () => void;
}

export function ChatHistorySidebar({
	activeSessionId,
	projectId,
	onSelectSession,
	onNewChat,
	onCollapse,
}: ChatHistorySidebarProps) {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editTitle, setEditTitle] = useState("");

	const queryKey = ["sessions", projectId ?? "all"];

	const { data: sessions = [], isLoading } = useQuery({
		queryKey,
		queryFn: () => {
			const qs = projectId ? `?project_id=${projectId}` : "";
			return apiFetch<Session[]>(`/api/v1/sessions${qs}`);
		},
		refetchInterval: 30_000,
	});

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return sessions;
		return sessions.filter((s) => s.title.toLowerCase().includes(q));
	}, [sessions, search]);

	const deleteSession = async (id: string, e: React.MouseEvent) => {
		e.stopPropagation();
		try {
			await apiFetch(`/api/v1/sessions/${id}`, { method: "DELETE" });
			queryClient.invalidateQueries({ queryKey: ["sessions"] });
			if (activeSessionId === id) onNewChat();
			toast.success("Conversation deleted");
		} catch {
			toast.error("Could not delete conversation");
		}
	};

	const startRename = (session: Session, e: React.MouseEvent) => {
		e.stopPropagation();
		setEditingId(session.id);
		setEditTitle(session.title);
	};

	const saveRename = async (id: string) => {
		const title = editTitle.trim();
		if (!title) {
			setEditingId(null);
			return;
		}
		try {
			await apiFetch(`/api/v1/sessions/${id}`, {
				method: "PATCH",
				body: JSON.stringify({ title }),
			});
			queryClient.invalidateQueries({ queryKey: ["sessions"] });
			toast.success("Conversation renamed");
		} catch {
			toast.error("Could not rename conversation");
		} finally {
			setEditingId(null);
		}
	};

	return (
		<aside className="flex h-full w-56 shrink-0 flex-col border-r border-border bg-card/30 lg:w-64">
			<div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-3">
				<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					History
				</span>
				<div className="flex items-center gap-0.5">
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8"
						onClick={onNewChat}
						title="New chat"
					>
						<Plus className="h-4 w-4" />
					</Button>
					{onCollapse && (
						<Button
							variant="ghost"
							size="icon"
							className="h-8 w-8"
							onClick={onCollapse}
							title="Hide history"
						>
							<PanelLeftClose className="h-4 w-4" />
						</Button>
					)}
				</div>
			</div>

			<div className="border-b border-border px-2 py-2">
				<div className="relative">
					<Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
					<Input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search chats…"
						className="h-8 pl-8 text-xs"
					/>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
				{isLoading && (
					<p className="px-2 py-4 text-xs text-muted-foreground">Loading…</p>
				)}
				{!isLoading && filtered.length === 0 && (
					<p className="px-2 py-4 text-xs text-muted-foreground">
						{search ? "No matching conversations" : "No conversations yet"}
					</p>
				)}
				{filtered.map((s) => (
					<div
						key={s.id}
						role="button"
						tabIndex={0}
						onClick={() => editingId !== s.id && onSelectSession(s.id)}
						onKeyDown={(e) =>
							e.key === "Enter" && editingId !== s.id && onSelectSession(s.id)
						}
						className={cn(
							"group mb-1 flex w-full cursor-pointer items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors",
							activeSessionId === s.id
								? "bg-primary text-primary-foreground"
								: "hover:bg-muted",
						)}
					>
						<MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" />
						{editingId === s.id ? (
							<input
								autoFocus
								value={editTitle}
								onChange={(e) => setEditTitle(e.target.value)}
								onBlur={() => saveRename(s.id)}
								onKeyDown={(e) => {
									if (e.key === "Enter") saveRename(s.id);
									if (e.key === "Escape") setEditingId(null);
									e.stopPropagation();
								}}
								onClick={(e) => e.stopPropagation()}
								className="min-w-0 flex-1 rounded border border-border bg-background px-1 py-0.5 text-xs text-foreground"
							/>
						) : (
							<span className="min-w-0 flex-1 truncate text-xs font-medium">
								{s.title}
							</span>
						)}
						<span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
							<button
								type="button"
								onClick={(e) => startRename(s, e)}
								className={cn(activeSessionId === s.id && "opacity-70")}
								aria-label="Rename"
							>
								<Pencil className="h-3.5 w-3.5" />
							</button>
							<button
								type="button"
								onClick={(e) => deleteSession(s.id, e)}
								className={cn(activeSessionId === s.id && "opacity-70")}
								aria-label="Delete"
							>
								<Trash2 className="h-3.5 w-3.5" />
							</button>
						</span>
					</div>
				))}
			</div>
		</aside>
	);
}
