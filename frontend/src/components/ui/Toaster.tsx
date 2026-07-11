import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useToastStore } from "@/stores/toastStore";
import { cn } from "@/lib/utils";

export function Toaster() {
  const { toasts, remove } = useToastStore();

  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "flex items-start gap-2 rounded-xl border bg-card px-4 py-3 text-sm shadow-lg animate-in slide-in-from-bottom-2",
            t.type === "error" && "border-destructive/30",
            t.type === "success" && "border-green-500/30"
          )}
        >
          {t.type === "success" && <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 mt-0.5" />}
          {t.type === "error" && <XCircle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />}
          {t.type === "info" && <Info className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />}
          <p className="flex-1 leading-snug">{t.message}</p>
          <button type="button" onClick={() => remove(t.id)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
