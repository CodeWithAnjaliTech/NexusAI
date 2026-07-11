import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Loader2 } from "lucide-react";
import {
  documentFileUrl,
  fetchDocumentBlob,
  fetchDocumentPreviewText,
} from "@/lib/api";
import type { FileAttachment } from "@/types";
import { cn } from "@/lib/utils";

interface FilePreviewProps {
  attachment: FileAttachment;
  className?: string;
}

function isImage(mime: string) {
  return mime.startsWith("image/");
}

function isPdf(mime: string, filename: string) {
  return mime === "application/pdf" || filename.toLowerCase().endsWith(".pdf");
}

function isTextPreview(mime: string, filename: string) {
  const lower = filename.toLowerCase();
  return (
    mime.startsWith("text/") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    lower.endsWith(".json") ||
    lower.endsWith(".py") ||
    lower.endsWith(".ts") ||
    lower.endsWith(".tsx") ||
    lower.endsWith(".js") ||
    mime.includes("wordprocessingml") ||
    lower.endsWith(".docx")
  );
}

function statusLabel(status: string) {
  switch (status) {
    case "indexed":
      return "Indexed";
    case "processing":
      return "Processing";
    case "failed":
      return "Indexing failed";
    default:
      return "Stored (not indexed)";
  }
}

function AttachmentMeta({ attachment }: { attachment: FileAttachment }) {
  const warn = attachment.status === "failed" || attachment.status === "stored";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
      <span className={warn ? "text-amber-600" : ""}>{statusLabel(attachment.status)}</span>
      <Link to="/knowledge" className="font-medium text-foreground hover:underline">
        Open in Knowledge
      </Link>
    </div>
  );
}

export function FilePreview({ attachment, className }: FilePreviewProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const needsBlob = isImage(attachment.mime_type) || isPdf(attachment.mime_type, attachment.filename);
  const needsText = isTextPreview(attachment.mime_type, attachment.filename) && !isPdf(attachment.mime_type, attachment.filename);

  useEffect(() => {
    let revoked: string | null = null;
    setLoading(true);
    setError(null);
    setBlobUrl(null);
    setTextPreview(null);

    const load = async () => {
      try {
        if (needsBlob) {
          const blob = await fetchDocumentBlob(attachment.id);
          const url = URL.createObjectURL(blob);
          revoked = url;
          setBlobUrl(url);
        } else if (needsText) {
          const data = await fetchDocumentPreviewText(attachment.id);
          setTextPreview(data.text_preview);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Preview failed");
      } finally {
        setLoading(false);
      }
    };

    void load();
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [attachment.id, attachment.mime_type, attachment.filename, needsBlob, needsText]);

  if (loading) {
    return (
      <div className={cn("flex h-32 items-center justify-center rounded-lg border border-border bg-muted/20", className)}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive", className)}>
        {error}
      </div>
    );
  }

  if (blobUrl && isImage(attachment.mime_type)) {
    return (
      <div className={cn("overflow-hidden rounded-lg border border-border", className)}>
        <img
          src={blobUrl}
          alt={attachment.filename}
          className="max-h-64 w-full object-contain bg-muted/30"
        />
        <p className="truncate px-3 py-1.5 text-xs text-muted-foreground">{attachment.filename}</p>
        <AttachmentMeta attachment={attachment} />
      </div>
    );
  }

  if (blobUrl && isPdf(attachment.mime_type, attachment.filename)) {
    return (
      <div className={cn("overflow-hidden rounded-lg border border-border", className)}>
        <iframe
          src={blobUrl}
          title={attachment.filename}
          className="h-72 w-full bg-muted/20"
        />
        <AttachmentMeta attachment={attachment} />
      </div>
    );
  }

  if (textPreview !== null) {
    return (
      <div className={cn("overflow-hidden rounded-lg border border-border", className)}>
        <div className="max-h-72 overflow-y-auto bg-muted/20 p-4">
          <pre className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">{textPreview}</pre>
        </div>
        <AttachmentMeta attachment={attachment} />
      </div>
    );
  }

  const externalUrl = documentFileUrl(attachment.id);
  return (
    <div className={cn("overflow-hidden rounded-lg border border-border", className)}>
      <a
        href={externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50"
      >
        <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate font-medium">{attachment.filename}</p>
          <p className="text-xs text-muted-foreground">
            {(attachment.file_size / 1024).toFixed(1)} KB
          </p>
        </div>
      </a>
      <AttachmentMeta attachment={attachment} />
    </div>
  );
}

interface FilePreviewListProps {
  attachments: FileAttachment[];
  className?: string;
}

export function FilePreviewList({ attachments, className }: FilePreviewListProps) {
  if (!attachments.length) return null;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {attachments.map((a) => (
        <FilePreview key={a.id} attachment={a} />
      ))}
    </div>
  );
}
