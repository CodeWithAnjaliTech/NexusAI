import { useCallback, useRef, useState } from "react";
import { Loader2, Paperclip, Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import {
  ChatContextMenu,
  ChatContextPills,
} from "@/components/chat/ContextSourceSelector";
import { uploadFile } from "@/lib/api";
import { useChatStore } from "@/stores/chatStore";
import { toast } from "@/stores/toastStore";
import type { FileAttachment, UploadResponse } from "@/types";

interface ChatInputProps {
  onSend: (message: string, attachments?: FileAttachment[]) => void;
  onStop?: () => void;
  isLoading: boolean;
}

export function ChatInput({ onSend, onStop, isLoading }: ChatInputProps) {
  const projectId = useChatStore((s) => s.projectId);
  const contextSource = useChatStore((s) => s.contextSource);
  const setContextSource = useChatStore((s) => s.setContextSource);
  const setContextDocumentId = useChatStore((s) => s.setContextDocumentId);
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<FileAttachment[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const toAttachment = (res: UploadResponse): FileAttachment => ({
    id: res.id,
    filename: res.filename,
    mime_type: res.mime_type,
    file_size: res.file_size,
    status: res.status,
  });

  const handleSend = () => {
    const trimmed = input.trim();
    if ((!trimmed && !pendingAttachments.length) || isLoading) return;
    onSend(trimmed, pendingAttachments.length ? pendingAttachments : undefined);
    setInput("");
    setPendingAttachments([]);
    setUploadError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFile = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setUploadError(null);
    try {
      const uploaded: FileAttachment[] = [];
      for (const file of Array.from(files)) {
        const result = await uploadFile(file, projectId);
        uploaded.push(toAttachment(result));
      }
      setPendingAttachments((prev) => [...prev, ...uploaded]);
      if (uploaded.length === 1) {
        setContextDocumentId(uploaded[0].id);
        if (contextSource === "none" || contextSource === "auto") {
          setContextSource("document");
        }
      }
      toast.success(uploaded.length === 1 ? "File attached" : `${uploaded.length} files attached`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setUploadError(msg);
      toast.error(msg.slice(0, 120));
    } finally {
      setUploading(false);
    }
  }, [projectId, contextSource, setContextDocumentId, setContextSource]);

  const inputDisabled = isLoading || uploading;

  return (
    <div
      className="relative px-4 pb-3 pt-1 sm:px-6 sm:pb-4"
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFile(e.dataTransfer.files);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
    >
      <div className="pointer-events-none absolute inset-x-0 -top-10 h-10 bg-gradient-to-t from-background via-background/80 to-transparent" />

      <div className="relative mx-auto w-full max-w-3xl">
        <ChatContextPills disabled={inputDisabled} />

        {pendingAttachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {pendingAttachments.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center rounded-full border border-dashed border-border/70 px-2.5 py-0.5 text-[11px] text-muted-foreground"
              >
                {a.filename}
              </span>
            ))}
          </div>
        )}

        <div
          className={`flex items-end gap-0.5 rounded-2xl border px-1.5 py-1 shadow-sm transition-colors ${
            dragOver
              ? "border-foreground/20 bg-muted/20"
              : isLoading
                ? "border-border/50 bg-muted/10"
                : "border-border/60 bg-background"
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            multiple
            accept=".pdf,.docx,.txt,.md,.py,.ts,.tsx,.js,.json,.png,.jpg,.jpeg,.webp"
            onChange={(e) => handleFile(e.target.files)}
          />

          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-xl text-muted-foreground hover:text-foreground"
            onClick={() => fileRef.current?.click()}
            disabled={inputDisabled}
            title="Attach file"
            aria-label="Attach file"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
          </Button>

          <ChatContextMenu disabled={inputDisabled} />

          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isLoading ? "NexusAI is replying…" : "Message NexusAI…"}
            disabled={isLoading}
            className="min-h-[40px] max-h-32 flex-1 resize-none border-0 bg-transparent px-0.5 py-2 text-sm leading-normal shadow-none focus-visible:ring-0 disabled:opacity-60"
            rows={1}
          />

          {isLoading && onStop ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-xl text-foreground"
              onClick={onStop}
              title="Stop generating"
              aria-label="Stop generating"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="h-9 w-9 shrink-0 rounded-xl"
              onClick={handleSend}
              disabled={!input.trim() && !pendingAttachments.length}
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>

        {uploadError && (
          <p className="mt-1.5 text-center text-[11px] text-destructive">{uploadError.slice(0, 120)}</p>
        )}
      </div>
    </div>
  );
}
