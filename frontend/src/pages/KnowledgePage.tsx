import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageEmpty, PageSection } from "@/components/layout/PageSection";
import { DocumentCard } from "@/components/knowledge/DocumentCard";
import { isPreviewableDoc, documentsQueryKey } from "@/components/knowledge/documentUtils";
import {
	apiFetch,
	formatApiError,
	reindexDocument,
	uploadFileWithProgress,
} from "@/lib/api";
import { useChatStore } from "@/stores/chatStore";
import { toast } from "@/stores/toastStore";
import { cn } from "@/lib/utils";
import type { FileAttachment, Project, UploadResponse } from "@/types";

function toAttachment(doc: UploadResponse): FileAttachment {
	return {
		id: doc.id,
		filename: doc.filename,
		mime_type: doc.mime_type,
		file_size: doc.file_size,
		status: doc.status,
	};
}

export function KnowledgePage() {
	const navigate = useNavigate();
	const projectId = useChatStore((s) => s.projectId);
	const [uploading, setUploading] = useState(false);
	const [uploadProgress, setUploadProgress] = useState(0);
	const [dragOver, setDragOver] = useState(false);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [reindexingId, setReindexingId] = useState<string | null>(null);

	const { data: projects = [] } = useQuery({
		queryKey: ["projects"],
		queryFn: () => apiFetch<Project[]>("/api/v1/projects"),
	});

	const {
		data: uploads = [],
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: documentsQueryKey(projectId),
		queryFn: () => {
			const qs = projectId ? `?project_id=${projectId}` : "";
			return apiFetch<UploadResponse[]>(`/api/v1/documents${qs}`);
		},
		retry: 1,
	});

	const handleFiles = useCallback(
		async (files: FileList | null) => {
			if (!files?.length) return;
			setUploading(true);
			setUploadProgress(0);
			try {
				const fileList = Array.from(files);
				for (let i = 0; i < fileList.length; i++) {
					const file = fileList[i];
					await uploadFileWithProgress(file, projectId, (pct) => {
						const overall = Math.round(
							((i + pct / 100) / fileList.length) * 100,
						);
						setUploadProgress(overall);
					});
				}
				toast.success(
					fileList.length === 1
						? "Document uploaded"
						: `${fileList.length} documents uploaded`,
				);
				refetch();
			} catch (err) {
				toast.error(formatApiError(err));
			} finally {
				setUploading(false);
				setUploadProgress(0);
			}
		},
		[refetch, projectId],
	);

	const deleteDoc = async (id: string) => {
		try {
			await apiFetch(`/api/v1/documents/${id}`, { method: "DELETE" });
			toast.success("Document deleted");
			if (expandedId === id) setExpandedId(null);
			refetch();
		} catch (err) {
			toast.error(formatApiError(err));
		}
	};

	const handleReindex = async (id: string) => {
		setReindexingId(id);
		try {
			await reindexDocument(id);
			toast.success("Document re-indexed");
			refetch();
		} catch (err) {
			toast.error(formatApiError(err));
		} finally {
			setReindexingId(null);
		}
	};

	const chatWithDoc = (doc: UploadResponse) => {
		useChatStore.getState().setContextSource("document");
		useChatStore.getState().setContextDocumentId(doc.id);
		navigate(`/?doc=${doc.id}&name=${encodeURIComponent(doc.filename)}`);
	};

	const activeProject = projects.find((p) => p.id === projectId);

	return (
		<div className="page-shell">
			<PageHeader
				title="Knowledge base"
				description="Upload PDFs, docs, and images. NexusAI indexes them for chat and search."
				action={
					<label>
						<Button
							variant="outline"
							size="sm"
							disabled={uploading}
							asChild
							className="rounded-lg"
						>
							<span>
								<Upload className="mr-1.5 h-3.5 w-3.5" />
								{uploading ? "Uploading…" : "Upload files"}
							</span>
						</Button>
						<input
							type="file"
							className="hidden"
							multiple
							accept=".pdf,.docx,.txt,.md,.py,.ts,.tsx,.js,.json,.png,.jpg,.jpeg,.webp"
							onChange={(e) => handleFiles(e.target.files)}
						/>
					</label>
				}
			/>

			<div className="page-content">
				{activeProject && (
					<p className="text-sm text-muted-foreground">
						Filtering by project:{" "}
						<span className="font-medium text-foreground">
							{activeProject.name}
						</span>{" "}
						— change in Chat header
					</p>
				)}

				<PageSection
					icon={Upload}
					title="Upload documents"
					description="Drop files here — PDF, DOCX, TXT, Markdown, images, and code"
				>
					<div
						className={cn(
							"border-b border-border px-4 py-6 transition-colors",
							dragOver && "bg-muted/40",
						)}
						onDrop={(e) => {
							e.preventDefault();
							setDragOver(false);
							handleFiles(e.dataTransfer.files);
						}}
						onDragOver={(e) => {
							e.preventDefault();
							setDragOver(true);
						}}
						onDragLeave={() => setDragOver(false)}
					>
						<div className="flex flex-col items-center justify-center text-center">
							<div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted/40">
								<Upload className="h-4 w-4" />
							</div>
							<p className="text-sm font-medium">
								Drop files here or use Upload files above
							</p>
							{uploading && (
								<div className="mt-4 w-full max-w-md">
									<div className="mb-1 flex justify-between text-xs text-muted-foreground">
										<span>Uploading…</span>
										<span>{uploadProgress}%</span>
									</div>
									<div className="h-1.5 overflow-hidden rounded-full bg-muted">
										<div
											className="h-full rounded-full bg-foreground transition-all duration-300"
											style={{ width: `${uploadProgress}%` }}
										/>
									</div>
								</div>
							)}
						</div>
					</div>

					{error && (
						<div className="flex items-start gap-2 border-b border-border px-4 py-3 text-sm text-destructive">
							<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
							<div>
								<p className="font-medium">Could not load documents</p>
								<p className="mt-1 text-destructive/90">
									{formatApiError(error)}
								</p>
							</div>
						</div>
					)}

					{isLoading && <PageEmpty>Loading documents…</PageEmpty>}

					{!isLoading && uploads.length === 0 && !error && (
						<PageEmpty>
							No documents yet. Upload your first file to get started.
						</PageEmpty>
					)}

					{uploads.length > 0 && (
						<>
							<div className="flex items-center justify-between border-b border-border px-4 py-2.5">
								<span className="text-xs font-medium text-muted-foreground">
									{uploads.length} {uploads.length === 1 ? "file" : "files"}
								</span>
							</div>
							<div className="divide-y divide-border">
								{uploads.map((doc) => (
									<DocumentCard
										key={doc.id}
										doc={doc}
										attachment={toAttachment(doc)}
										expanded={expandedId === doc.id}
										previewable={isPreviewableDoc(doc)}
										reindexing={reindexingId === doc.id}
										onTogglePreview={() =>
											setExpandedId(expandedId === doc.id ? null : doc.id)
										}
										onChat={() => chatWithDoc(doc)}
										onReindex={() => handleReindex(doc.id)}
										onDelete={() => deleteDoc(doc.id)}
									/>
								))}
							</div>
						</>
					)}
				</PageSection>
			</div>
		</div>
	);
}
