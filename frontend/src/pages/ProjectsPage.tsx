import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderKanban, FolderPlus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageEmpty, PageSection } from "@/components/layout/PageSection";
import { apiFetch } from "@/lib/api";

interface Project {
	id: string;
	name: string;
	description: string | null;
}

export function ProjectsPage() {
	const queryClient = useQueryClient();
	const [showCreate, setShowCreate] = useState(false);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");

	const { data: projects = [], isLoading } = useQuery({
		queryKey: ["projects"],
		queryFn: () => apiFetch<Project[]>("/api/v1/projects"),
	});

	const createProject = async () => {
		if (!name.trim()) return;
		await apiFetch("/api/v1/projects", {
			method: "POST",
			body: JSON.stringify({ name, description: description || null }),
		});
		setName("");
		setDescription("");
		setShowCreate(false);
		queryClient.invalidateQueries({ queryKey: ["projects"] });
	};

	const deleteProject = async (id: string) => {
		await apiFetch(`/api/v1/projects/${id}`, { method: "DELETE" });
		queryClient.invalidateQueries({ queryKey: ["projects"] });
	};

	return (
		<div className="page-shell">
			<PageHeader
				title="Projects"
				description="Organize chats and documents into workspaces."
				action={
					<Button
						variant="outline"
						size="sm"
						className="rounded-lg"
						onClick={() => setShowCreate((v) => !v)}
					>
						<Plus className="mr-1.5 h-3.5 w-3.5" />
						{showCreate ? "Hide form" : "New project"}
					</Button>
				}
			/>

			<div className="page-content">
				{showCreate && (
					<PageSection icon={FolderPlus} title="Create project">
						<div className="grid gap-3 px-4 py-3.5 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1fr)_minmax(16rem,2fr)_auto] lg:items-center">
							<Input
								placeholder="Project name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								className="h-10 rounded-xl"
							/>
							<Input
								placeholder="Description (optional)"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								className="h-10 rounded-xl sm:col-span-2 lg:col-span-1"
							/>
							<div className="flex gap-2 sm:col-span-2 lg:col-span-1">
								<Button
									onClick={createProject}
									size="sm"
									className="gap-2 rounded-lg"
								>
									<FolderPlus className="h-4 w-4" />
									Create
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

				<PageSection
					icon={FolderKanban}
					title="Your projects"
					description={
						isLoading
							? "Loading…"
							: `${projects.length} workspace${projects.length === 1 ? "" : "s"}`
					}
				>
					{isLoading && <PageEmpty>Loading projects…</PageEmpty>}

					{!isLoading && projects.length === 0 && (
						<PageEmpty>
							Create your first project to organize chats and documents.
						</PageEmpty>
					)}

					{projects.length > 0 && (
						<div className="divide-y divide-border">
							{projects.map((p) => (
								<div
									key={p.id}
									className="flex items-center gap-3 px-4 py-3.5 sm:justify-between"
								>
									<div className="flex min-w-0 flex-1 items-center gap-3">
										<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
											<FolderKanban className="h-4 w-4" />
										</div>
										<div className="min-w-0">
											<p className="text-sm font-semibold">{p.name}</p>
											{p.description ? (
												<p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
													{p.description}
												</p>
											) : (
												<p className="mt-0.5 text-xs text-muted-foreground">
													No description
												</p>
											)}
										</div>
									</div>
									<Button
										variant="ghost"
										size="icon"
										className="shrink-0 rounded-lg text-muted-foreground hover:text-destructive"
										onClick={() => deleteProject(p.id)}
										title="Delete project"
									>
										<Trash2 className="h-4 w-4" />
									</Button>
								</div>
							))}
						</div>
					)}
				</PageSection>
			</div>
		</div>
	);
}
