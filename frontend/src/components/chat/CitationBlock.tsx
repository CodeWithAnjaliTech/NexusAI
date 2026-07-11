import { documentFileUrl } from "@/lib/api";
import type { Citation } from "@/types/citations";

interface CitationBlockProps {
  citations: Citation[];
}

export function CitationBlock({ citations }: CitationBlockProps) {
  if (!citations.length) return null;

  return (
    <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Sources</p>
      {citations.map((cite) => (
        <div key={cite.id} className="text-xs leading-relaxed text-muted-foreground">
          {cite.document_id ? (
            <a
              href={documentFileUrl(cite.document_id)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground hover:underline"
            >
              {cite.source}
            </a>
          ) : (
            <span className="text-foreground">{cite.source}</span>
          )}
          <span className="mx-1">·</span>
          <span className="line-clamp-2">{cite.content}</span>
        </div>
      ))}
    </div>
  );
}
