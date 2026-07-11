import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Brain, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageEmpty, PageSection } from "@/components/layout/PageSection";
import { ConversationMemoryPanel } from "@/components/memory/ConversationMemoryPanel";
import { KnowledgeSearchResultCard } from "@/components/memory/KnowledgeSearchResultCard";
import { InfraHealthBanner } from "@/components/system/InfraHealthBanner";
import { apiFetch } from "@/lib/api";
import { useChatStore } from "@/stores/chatStore";
import type { MemorySearchResult } from "@/types";

interface SearchResponse {
	query: string;
	results: MemorySearchResult[];
	total: number;
}

export function MemoryPage() {
	const projectId = useChatStore((s) => s.projectId);
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<MemorySearchResult[]>([]);
	const [searching, setSearching] = useState(false);
	const [searched, setSearched] = useState(false);

	const { data: entries = [] } = useQuery({
		queryKey: ["memory-entries"],
		queryFn: () => apiFetch<{ id: string }[]>("/api/v1/memory/entries"),
	});

	const handleSearch = async () => {
		if (!query.trim()) return;
		setSearching(true);
		setSearched(true);
		try {
			const body: Record<string, unknown> = { query, limit: 10 };
			if (projectId) body.project_id = projectId;
			const res = await apiFetch<SearchResponse>("/api/v1/memory/search", {
				method: "POST",
				body: JSON.stringify(body),
			});
			setResults(res.results);
		} catch (err) {
			console.error(err);
			setResults([]);
		} finally {
			setSearching(false);
		}
	};

	return (
		<div className="page-shell">
			<PageHeader
				title="Memory"
				description="Search your knowledge base and manage conversation memories NexusAI uses for context."
			/>

			<div className="page-content">
				<InfraHealthBanner compact />

				<PageSection
					icon={Search}
					title="Knowledge search"
					description={
						projectId
							? "Scoped to active project — change project in Chat header to search all knowledge."
							: "Semantic search across uploaded documents."
					}
				>
					<div className="border-b border-border px-4 py-3.5">
						<div className="flex w-full gap-2">
							<Input
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="e.g. API authentication requirements"
								className="h-10 rounded-xl"
								onKeyDown={(e) => e.key === "Enter" && handleSearch()}
							/>
							<Button
								onClick={handleSearch}
								disabled={searching}
								className="h-10 rounded-xl px-4"
							>
								<Search className="h-4 w-4" />
							</Button>
						</div>
					</div>

					{searched && results.length === 0 && !searching && (
						<PageEmpty>
							No results found. Try different keywords or upload more documents.
						</PageEmpty>
					)}

					{!searched && !searching && (
						<PageEmpty>
							Search results from your indexed documents will appear here.
						</PageEmpty>
					)}

					{results.length > 0 && (
						<div className="divide-y divide-border">
							{results.map((result) => (
								<KnowledgeSearchResultCard key={result.id} result={result} />
							))}
						</div>
					)}
				</PageSection>

				<PageSection
					icon={Brain}
					title="Conversation memory"
					description="Saved Q&A from your chats — expand, copy, open, or delete."
				>
					<ConversationMemoryPanel />
				</PageSection>

				{entries.length > 0 && (
					<p className="text-xs text-muted-foreground">
						{entries.length} memory {entries.length === 1 ? "entry" : "entries"}{" "}
						stored.
					</p>
				)}
			</div>
		</div>
	);
}
