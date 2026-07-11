import {
	Code2,
	Eye,
	EyeOff,
	FileImage,
	FileText,
	FileType,
	MessageSquare,
	RefreshCw,
	Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilePreview } from "@/components/chat/FilePreview";
import {
	FILE_KIND_META,
	formatFileSize,
	getDocFileKind,
	statusMeta,
	type DocFileKind,
} from "@/components/knowledge/documentUtils";
import { cn } from "@/lib/utils";
import type { FileAttachment, UploadResponse } from "@/types";

function FileKindIcon({
	kind,
	className,
}: {
	kind: DocFileKind;
	className?: string;
}) {
	const props = { className: cn("h-4 w-4", className) };
	switch (kind) {
		case "pdf":
			return <FileType {...props} />;
		case "docx":
			return <FileText {...props} />;
		case "image":
			return <FileImage {...props} />;
		case "code":
			return <Code2 {...props} />;
		default:
			return <FileText {...props} />;
	}
}

interface DocumentCardProps {
	doc: UploadResponse;
	attachment: FileAttachment;
	expanded: boolean;
	previewable: boolean;
	reindexing: boolean;
	onTogglePreview: () => void;
	onChat: () => void;
	onReindex: () => void;
	onDelete: () => void;
}

export function DocumentCard({
	doc,
	attachment,
	expanded,
	previewable,
	reindexing,
	onTogglePreview,
	onChat,
	onReindex,
	onDelete,
}: DocumentCardProps) {
	const kind = getDocFileKind(doc);
	const kindMeta = FILE_KIND_META[kind];
	const status = statusMeta(doc.status);
	const showReindex = doc.status === "failed" || doc.status === "stored";

	return (
		<article className="overflow-hidden">
			<div className="flex items-center gap-2.5 px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5">
				{/* Compact file icon */}
				<div
					className={cn(
						"flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/50",
						kindMeta.iconBg,
					)}
				>
					<FileKindIcon kind={kind} />
				</div>

				{/* Name + meta — single dense block */}
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 items-center gap-1.5">
						<p
							className="min-w-0 truncate text-sm font-medium text-foreground"
							title={doc.filename}
						>
							{doc.filename}
						</p>
						<span
							className={cn(
								"hidden shrink-0 rounded border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide sm:inline-flex",
								kindMeta.badgeClass,
							)}
						>
							{kindMeta.label}
						</span>
						<span
							className={cn(
								"hidden shrink-0 rounded border px-1.5 py-px text-[9px] font-medium sm:inline-flex",
								status.className,
							)}
						>
							{status.label}
						</span>
					</div>
					<p className="truncate text-[11px] text-muted-foreground">
						{formatFileSize(doc.file_size)}
						{doc.chunk_count > 0 && (
							<>
								<span className="mx-1">·</span>
								{doc.chunk_count} chunks
							</>
						)}
						<span className="mx-1 sm:hidden">·</span>
						<span className="capitalize sm:hidden">{status.label}</span>
					</p>
				</div>

				{/* Compact actions */}
				<div className="flex shrink-0 items-center gap-0.5">
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7 rounded-md"
						onClick={onChat}
						title="Chat with document"
					>
						<MessageSquare className="h-3.5 w-3.5" />
					</Button>
					{previewable && (
						<Button
							variant="ghost"
							size="icon"
							className="h-7 w-7 rounded-md"
							onClick={onTogglePreview}
							title={expanded ? "Hide preview" : "Preview"}
						>
							{expanded ? (
								<EyeOff className="h-3.5 w-3.5" />
							) : (
								<Eye className="h-3.5 w-3.5" />
							)}
						</Button>
					)}
					{showReindex && (
						<Button
							variant="ghost"
							size="icon"
							className="h-7 w-7 rounded-md"
							disabled={reindexing}
							onClick={onReindex}
							title="Re-index"
						>
							<RefreshCw
								className={cn("h-3.5 w-3.5", reindexing && "animate-spin")}
							/>
						</Button>
					)}
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7 rounded-md text-muted-foreground hover:text-destructive"
						onClick={onDelete}
						title="Delete"
					>
						<Trash2 className="h-3.5 w-3.5" />
					</Button>
				</div>
			</div>

			{expanded && previewable && (
				<div className="border-t border-border bg-muted/15 px-3 py-3 sm:px-4">
					<FilePreview attachment={attachment} />
				</div>
			)}
		</article>
	);
}
