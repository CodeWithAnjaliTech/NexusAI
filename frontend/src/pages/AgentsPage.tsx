import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, ChevronDown, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { AgentRow, CustomAgentRow } from "@/components/agents/AgentRow";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageEmpty, PageSection } from "@/components/layout/PageSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChatStore } from "@/stores/chatStore";
import { toast } from "@/stores/toastStore";
import {
	AGENT_LABELS,
	AGENT_OPTIONS,
	type Agent,
	type AgentKey,
} from "@/types";

interface CustomAgent {
	id: string;
	name: string;
	description: string | null;
	system_prompt: string;
	base_agent_key: string;
}

const BASE_AGENT_OPTIONS = AGENT_OPTIONS.filter((o) => o.key !== "auto");

export function AgentsPage() {
	const navigate = useNavigate();
	const { activeAgent, setPreferredMode } = useChatStore();
	const queryClient = useQueryClient();
	const [showCreate, setShowCreate] = useState(false);
	const [name, setName] = useState("");
	const [prompt, setPrompt] = useState("You are a helpful specialist for...");
	const [baseAgentKey, setBaseAgentKey] = useState<AgentKey>("general");

	const { data: agents = [], isLoading } = useQuery({
		queryKey: ["agents"],
		queryFn: () => apiFetch<Agent[]>("/api/v1/agents"),
		refetchInterval: 30000,
	});

	const { data: customAgents = [] } = useQuery({
		queryKey: ["custom-agents"],
		queryFn: () => apiFetch<CustomAgent[]>("/api/v1/custom-agents"),
	});

	const createCustom = async () => {
		if (!name.trim() || prompt.length < 10) return;
		try {
			await apiFetch("/api/v1/custom-agents", {
				method: "POST",
				body: JSON.stringify({
					name,
					system_prompt: prompt,
					base_agent_key: baseAgentKey,
				}),
			});
			setName("");
			setPrompt("You are a helpful specialist for...");
			setShowCreate(false);
			toast.success("Custom agent created");
			queryClient.invalidateQueries({ queryKey: ["custom-agents"] });
		} catch {
			toast.error("Could not create agent");
		}
	};

	const deleteCustom = async (id: string) => {
		try {
			await apiFetch(`/api/v1/custom-agents/${id}`, { method: "DELETE" });
			toast.success("Agent removed");
			queryClient.invalidateQueries({ queryKey: ["custom-agents"] });
		} catch {
			toast.error("Could not delete agent");
		}
	};

	const useInChat = (agentId: string) => {
		setPreferredMode(`custom:${agentId}`);
		navigate("/");
		toast.success("Custom agent selected in Chat");
	};

	const useBuiltIn = (key: AgentKey) => {
		setPreferredMode(key);
		navigate("/");
		toast.success(`${AGENT_LABELS[key]} selected in Chat`);
	};

	return (
		<div className="page-shell">
			<PageHeader
				title="Agents"
				description="Specialists for code, docs, research, and more — pick one in Chat or let Auto route for you."
				action={
					<Button
						variant="outline"
						size="sm"
						className="rounded-lg"
						onClick={() => setShowCreate((v) => !v)}
					>
						<Plus className="mr-1.5 h-3.5 w-3.5" />
						{showCreate ? "Hide form" : "New custom agent"}
					</Button>
				}
			/>

			<div className="page-content">
				{showCreate && (
					<PageSection icon={Plus} title="Create custom agent">
						<div className="grid gap-3 px-4 py-3.5 lg:grid-cols-2">
							<Input
								placeholder="Agent name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								className="h-10 rounded-xl"
							/>
							<select
								value={baseAgentKey}
								onChange={(e) => setBaseAgentKey(e.target.value as AgentKey)}
								className="select-field h-10 w-full rounded-xl"
								aria-label="Base specialist"
							>
								{BASE_AGENT_OPTIONS.map((o) => (
									<option key={o.key} value={o.key}>
										Based on {o.label}
									</option>
								))}
							</select>
							<textarea
								value={prompt}
								onChange={(e) => setPrompt(e.target.value)}
								placeholder="System prompt — describe how this agent should behave…"
								className="min-h-[80px] w-full rounded-xl border border-border bg-background p-3 text-sm lg:col-span-2"
							/>
							<div className="flex gap-2 lg:col-span-2">
								<Button onClick={createCustom} size="sm" className="rounded-lg">
									Save agent
								</Button>
								<Button
									variant="ghost"
									size="sm"
									className="rounded-lg"
									onClick={() => setShowCreate(false)}
								>
									Cancel
								</Button>
							</div>
						</div>
					</PageSection>
				)}

				{customAgents.length > 0 && (
					<PageSection
						icon={Bot}
						title="Your custom agents"
						description={`${customAgents.length} saved ${customAgents.length === 1 ? "agent" : "agents"}`}
					>
						<div className="divide-y divide-border">
							{customAgents.map((a) => (
								<CustomAgentRow
									key={a.id}
									id={a.id}
									name={a.name}
									baseAgentKey={a.base_agent_key}
									systemPrompt={a.system_prompt}
									onUse={() => useInChat(a.id)}
									onDelete={() => deleteCustom(a.id)}
								/>
							))}
						</div>
					</PageSection>
				)}

				<PageSection
					icon={Bot}
					title="Built-in specialists"
					description="Auto mode picks the best match from these — or pin one in Chat."
				>
					{isLoading ? (
						<PageEmpty>Loading agents…</PageEmpty>
					) : agents.length === 0 ? (
						<PageEmpty>No agents available.</PageEmpty>
					) : (
						<div className="divide-y divide-border">
							{agents.map((agent) => (
								<AgentRow
									key={agent.id}
									agent={agent}
									selected={activeAgent === agent.agent_key}
									onUse={() => useBuiltIn(agent.agent_key as AgentKey)}
								/>
							))}
						</div>
					)}
				</PageSection>

				<details className="group rounded-xl border border-border bg-muted/20">
					<summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
						<span className="text-muted-foreground">
							How agent routing works
						</span>
						<ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
					</summary>
					<div className="border-t border-border px-4 py-3 text-xs leading-relaxed text-muted-foreground">
						<p>
							With <span className="font-medium text-foreground">Auto</span>,
							NexusAI reads your message and routes to the right specialist. Pin
							a specific agent in Chat when you want consistent behavior (e.g.
							always use Code Sandbox for debugging).
						</p>
					</div>
				</details>
			</div>
		</div>
	);
}
