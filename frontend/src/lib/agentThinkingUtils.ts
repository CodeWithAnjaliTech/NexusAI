import { AGENT_LABELS, type AgentKey, type GraphEvent } from "@/types";

const AGENT_KEYS: AgentKey[] = [
	"code_sandbox",
	"blueprint",
	"documentation",
	"research",
	"general",
];

export function isAgentKey(value: string): value is AgentKey {
	return AGENT_KEYS.includes(value as AgentKey);
}

export const AGENT_IDLE_COPY: Record<AgentKey, string> = {
	code_sandbox: "Spinning up the code sandbox…",
	blueprint: "Reviewing specs and standards…",
	documentation: "Searching your documents…",
	research: "Gathering sources and context…",
	general: "Finding the best approach…",
};

export const AGENT_WRITING_COPY: Record<AgentKey, string> = {
	code_sandbox: "Tracing the issue and drafting a fix…",
	blueprint: "Drafting technical guidance…",
	documentation: "Synthesizing from your files…",
	research: "Weighing evidence and trade-offs…",
	general: "Composing a clear answer…",
};

export function resolveAgentFromEvents(
	events: GraphEvent[],
): AgentKey | null {
	for (let i = events.length - 1; i >= 0; i -= 1) {
		const event = events[i];
		const metaAgent = event.metadata?.agent;
		if (typeof metaAgent === "string" && isAgentKey(metaAgent)) {
			return metaAgent;
		}
		if (isAgentKey(event.node)) {
			return event.node;
		}
	}
	return null;
}

function mapEventToCopy(event: GraphEvent, agent: AgentKey | null): string {
	const label = event.label.toLowerCase();
	const { node, type, status } = event;

	if (label.includes("web search")) {
		return "Searching the web for fresh context…";
	}
	if (label.includes("calculator")) {
		return "Crunching the numbers…";
	}
	if (label.includes("github")) {
		return "Pulling context from your repository…";
	}
	if (label.includes("memory retrieval")) {
		return "Searching your knowledge base…";
	}
	if (label.includes("sandbox execution")) {
		return "Running your code in the sandbox…";
	}
	if (node === "router_agent" || label.includes("router")) {
		const routed = event.metadata?.agent;
		if (typeof routed === "string" && isAgentKey(routed)) {
			return `Handing off to ${AGENT_LABELS[routed]}…`;
		}
		return "Choosing the best specialist…";
	}
	if (node === "intent_classifier" || type === "classification") {
		if (status === "running") {
			return "Analyzing what you need…";
		}
		const intent = event.metadata?.intent;
		if (typeof intent === "string" && intent.length > 0) {
			return `Identified a ${intent.replace(/_/g, " ")} question…`;
		}
		return "Analyzing your intent…";
	}
	if (label.includes("response validation")) {
		return "Polishing the response…";
	}
	if (label.includes("memory update")) {
		return "Updating conversation memory…";
	}
	if (type === "agent" || isAgentKey(node)) {
		const active = agent ?? (isAgentKey(node) ? node : null);
		if (active) {
			return status === "running"
				? AGENT_WRITING_COPY[active]
				: `Consulting ${AGENT_LABELS[active]}…`;
		}
	}

	if (status === "running") {
		return `${event.label}…`;
	}

	return agent ? AGENT_IDLE_COPY[agent] : "Understanding your question…";
}

export function resolveThinkingText(
	events: GraphEvent[],
	forcedAgent?: AgentKey | null,
): string {
	const agent =
		forcedAgent ?? resolveAgentFromEvents(events) ?? null;

	if (events.length === 0) {
		return agent ? AGENT_IDLE_COPY[agent] : "Understanding your question…";
	}

	const running = [...events].reverse().find((e) => e.status === "running");
	const focus = running ?? events[events.length - 1];
	return mapEventToCopy(focus, agent);
}
