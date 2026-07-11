import type { UploadResponse } from "@/types";

export type DocFileKind = "pdf" | "docx" | "image" | "text" | "code" | "other";

export function getDocFileKind(doc: UploadResponse): DocFileKind {
  const name = doc.filename.toLowerCase();
  const mime = doc.mime_type.toLowerCase();

  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (mime.includes("wordprocessingml") || name.endsWith(".docx")) return "docx";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("text/") || name.match(/\.(txt|md)$/)) return "text";
  if (name.match(/\.(py|ts|tsx|js|json|java|go|rs)$/)) return "code";
  return "other";
}

export const FILE_KIND_META: Record<
  DocFileKind,
  { label: string; badgeClass: string; iconBg: string }
> = {
  pdf: {
    label: "PDF",
    badgeClass: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
    iconBg: "bg-red-500/10 text-red-600 dark:text-red-400",
  },
  docx: {
    label: "DOCX",
    badgeClass: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
    iconBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  image: {
    label: "Image",
    badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    iconBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  text: {
    label: "Text",
    badgeClass: "bg-amber-500/10 text-amber-800 dark:text-amber-400 border-amber-500/20",
    iconBg: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  code: {
    label: "Code",
    badgeClass: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20",
    iconBg: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  other: {
    label: "File",
    badgeClass: "bg-muted text-muted-foreground border-border",
    iconBg: "bg-muted text-muted-foreground",
  },
};

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isPreviewableDoc(doc: UploadResponse): boolean {
  const kind = getDocFileKind(doc);
  return kind !== "other" || doc.mime_type.startsWith("text/");
}

export function statusMeta(status: string): { label: string; className: string } {
  switch (status) {
    case "indexed":
      return {
        label: "Indexed",
        className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
      };
    case "failed":
      return {
        label: "Failed",
        className: "bg-destructive/10 text-destructive border-destructive/20",
      };
    case "processing":
      return {
        label: "Processing",
        className: "bg-amber-500/10 text-amber-800 dark:text-amber-400 border-amber-500/20",
      };
    case "stored":
      return {
        label: "Stored",
        className: "bg-muted text-muted-foreground border-border",
      };
    default:
      return { label: status, className: "bg-muted text-muted-foreground border-border" };
  }
}

/** Documents usable as chat context (indexed in Chroma or stored on disk with chunks). */
export function isSelectableKnowledgeDoc(doc: UploadResponse): boolean {
  return doc.status === "indexed" || doc.status === "stored";
}

export function documentsQueryKey(projectId: string | null | undefined): [string, string] {
  return ["documents", projectId ?? "all"];
}
