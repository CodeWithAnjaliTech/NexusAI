import { useMemo } from "react";
import { resolveThinkingText } from "@/lib/agentThinkingUtils";
import type { AgentKey, GraphEvent } from "@/types";

interface AgentThinkingProps {
	events: GraphEvent[];
	forcedAgent?: AgentKey | null;
}

export function AgentThinking({ events, forcedAgent }: AgentThinkingProps) {
	const text = useMemo(
		() => resolveThinkingText(events, forcedAgent),
		[events, forcedAgent],
	);

	return (
		<span
			className="inline-flex max-w-full items-center gap-2 text-sm leading-relaxed text-muted-foreground"
			role="status"
			aria-live="polite"
		>
			<span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden />
			<span className="agent-thinking-shimmer truncate">{text}</span>
		</span>
	);
}
