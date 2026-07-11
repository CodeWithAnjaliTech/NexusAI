import { Check, Copy, RefreshCw } from "lucide-react";
import { useDeferredValue, useRef, useState } from "react";
import { CitationBlock } from "@/components/chat/CitationBlock";
import { AgentThinking } from "@/components/chat/AgentThinking";
import { FilePreviewList } from "@/components/chat/FilePreview";
import { MarkdownContent } from "@/components/chat/MarkdownContent";
import { Button } from "@/components/ui/button";
import { toast } from "@/stores/toastStore";
import { sanitizeAssistantMarkdown, stripIncompleteFencedBlocks } from "@/lib/chatContentUtils";
import { prepareMermaidMarkdown } from "@/lib/mermaidUtils";
import { prepareChatMarkdown } from "@/lib/asciiDiagramUtils";
import type { AgentKey, ChatMessage, GraphEvent } from "@/types";

interface MessageBubbleProps {
  message: ChatMessage;
  onRegenerate?: () => void;
  isLoading?: boolean;
  isStreaming?: boolean;
  showCitations?: boolean;
  graphEvents?: GraphEvent[];
  thinkingAgent?: AgentKey | null;
}

export function MessageBubble({
  message,
  onRegenerate,
  isLoading,
  isStreaming,
  showCitations = false,
  graphEvents,
  thinkingAgent,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const hasReplyStarted = useRef(false);
  const messageIdRef = useRef(message.id);

  if (messageIdRef.current !== message.id) {
    messageIdRef.current = message.id;
    hasReplyStarted.current = false;
  }
  const rawContent =
    !isUser && message.content
      ? isStreaming
        ? stripIncompleteFencedBlocks(message.content)
        : message.content
      : message.content;
  const displayContent =
    !isUser && rawContent
      ? prepareChatMarkdown(
          prepareMermaidMarkdown(sanitizeAssistantMarkdown(rawContent)),
        )
      : rawContent;

  if (rawContent?.trim()) {
    hasReplyStarted.current = true;
  }

  const deferredContent = useDeferredValue(displayContent);
  const markdownContent = isStreaming ? deferredContent : displayContent;
  const showThinking =
    isStreaming && !hasReplyStarted.current && !markdownContent?.trim();

  const copyContent = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    toast.success("Copied");
    setTimeout(() => setCopied(false), 2000);
  };

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] space-y-2 sm:max-w-[75%]">
          <p className="whitespace-pre-wrap rounded-2xl bg-foreground px-4 py-2.5 text-sm leading-relaxed text-background">
            {message.content}
          </p>
          {message.attachments && message.attachments.length > 0 && (
            <FilePreviewList attachments={message.attachments} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="group">
      <div className="text-sm leading-relaxed text-foreground">
        {showThinking ? (
          <AgentThinking
            events={graphEvents ?? []}
            forcedAgent={thinkingAgent ?? message.agent}
          />
        ) : markdownContent ? (
          <>
            <MarkdownContent content={markdownContent} isStreaming={isStreaming} />
            {isStreaming && (
              <span
                className="ml-0.5 inline-block h-[1.1em] w-0.5 translate-y-px animate-pulse bg-foreground/70 align-text-bottom"
                aria-hidden
              />
            )}
          </>
        ) : null}
      </div>

      {message.content && !isStreaming && (
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={copyContent}
            title="Copy"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
          {onRegenerate && !isLoading && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={onRegenerate}
              title="Regenerate"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}

      {showCitations && message.citations && message.citations.length > 0 && (
        <CitationBlock citations={message.citations} />
      )}
    </div>
  );
}
