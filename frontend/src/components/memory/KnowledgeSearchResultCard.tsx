import { Link, useNavigate } from "react-router-dom";
import { Copy, ExternalLink, FileText, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MemorySearchResult } from "@/types";

interface KnowledgeSearchResultCardProps {
  result: MemorySearchResult;
}

export function KnowledgeSearchResultCard({ result }: KnowledgeSearchResultCardProps) {
  const navigate = useNavigate();
  const filename =
    typeof result.metadata?.filename === "string" ? result.metadata.filename : "Document";
  const documentId =
    typeof result.metadata?.document_id === "string" ? result.metadata.document_id : null;

  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-1 gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
          <FileText className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{filename}</h3>
            <span className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {(result.score * 100).toFixed(0)}% match
            </span>
          </div>
          <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
            {result.content}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-stretch">
        <Button
          size="sm"
          variant="outline"
          className="rounded-lg"
          onClick={() => {
            if (documentId) {
              navigate(`/?doc=${documentId}&name=${encodeURIComponent(filename)}`);
            } else {
              navigate("/");
            }
          }}
        >
          <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
          Ask in Chat
        </Button>
        {documentId && (
          <Button asChild size="sm" variant="ghost" className="rounded-lg">
            <Link to="/knowledge">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Knowledge
            </Link>
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="rounded-lg"
          onClick={async () => {
            await navigator.clipboard.writeText(result.content);
          }}
        >
          <Copy className="mr-1.5 h-3.5 w-3.5" />
          Copy
        </Button>
      </div>
    </div>
  );
}
