export type ContextSource = "none" | "github" | "document" | "both" | "auto";

export type IntentType =
	| "coding"
	| "blueprint"
	| "documentation"
	| "research"
	| "general";

export type AgentKey =
	| "code_sandbox"
	| "blueprint"
	| "documentation"
	| "research"
	| "general";

export interface GraphEvent {
	node: string;
	type: string;
	label: string;
	status: "running" | "completed" | "failed";
	metadata?: Record<string, unknown>;
}

export interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	agent?: AgentKey;
	intent?: IntentType;
	citations?: import("@/types/citations").Citation[];
	attachments?: FileAttachment[];
	createdAt?: string;
}

export interface FileAttachment {
	id: string;
	filename: string;
	mime_type: string;
	file_size: number;
	status: string;
}

export interface ChatResponse {
	session_id: string;
	message_id: string;
	content: string;
	agent: AgentKey;
	intent: IntentType;
	graph_events: GraphEvent[];
	citations?: import("@/types/citations").Citation[];
	duration_ms?: number;
}

export interface Agent {
	id: string;
	agent_key: AgentKey;
	name: string;
	description: string;
	capabilities: string[];
	status: string;
}

export interface Session {
	id: string;
	user_id: string;
	title: string;
	status: string;
	created_at: string;
	updated_at: string;
	project_id?: string | null;
	message_count?: number;
}

export interface Project {
	id: string;
	name: string;
	description: string | null;
}

export interface CustomAgent {
	id: string;
	name: string;
	description: string | null;
	system_prompt: string;
	base_agent_key: string;
}

export interface GraphNode {
	id: string;
	type: string;
	label: string;
	status: string;
	metadata?: Record<string, unknown>;
}

export interface GraphEdge {
	id: string;
	source: string;
	target: string;
	label?: string;
}

export interface GraphState {
	session_id: string;
	nodes: GraphNode[];
	edges: GraphEdge[];
	current_node?: string;
}

export interface MemorySearchResult {
	id: string;
	content: string;
	score: number;
	metadata: Record<string, unknown>;
}

export interface UploadResponse {
	id: string;
	filename: string;
	mime_type: string;
	file_size: number;
	status: string;
	chunk_count: number;
	created_at: string;
}

export interface GitHubSettings {
	connected: boolean;
	username: string | null;
	repo_url: string | null;
}

/** Monochrome shades for agent distinction (black & white brand) */
export const AGENT_COLORS: Record<AgentKey, string> = {
	code_sandbox: "#0a0a0a",
	blueprint: "#262626",
	documentation: "#525252",
	research: "#737373",
	general: "#a3a3a3",
};

export const AGENT_LABELS: Record<AgentKey, string> = {
	code_sandbox: "Code Sandbox",
	blueprint: "Blueprint & Spec",
	documentation: "Documentation",
	research: "Research",
	general: "General",
};

export const AGENT_OPTIONS: { key: AgentKey | "auto"; label: string }[] = [
	{ key: "auto", label: "Auto (Smart routing)" },
	{ key: "code_sandbox", label: "Code Sandbox" },
	{ key: "blueprint", label: "Blueprint & Spec" },
	{ key: "documentation", label: "Documentation" },
	{ key: "research", label: "Research" },
	{ key: "general", label: "General" },
];
