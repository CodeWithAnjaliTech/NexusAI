import { Link } from "react-router-dom";
import { ArrowRight, Lock } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";

export function GuestChatBanner() {
  const token = useAuthStore((s) => s.token);

  if (token) return null;

  return (
    <div className="border-b border-border bg-muted/30 px-4 py-2.5">
      <div className="mx-auto flex max-w-3xl items-center justify-center gap-2 text-xs text-muted-foreground sm:gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-background">
          <Lock className="h-3 w-3" />
        </span>
        <span>
          Guest mode — chat only.{" "}
          <Link
            to="/login"
            className="inline-flex items-center gap-0.5 font-medium text-foreground underline-offset-2 hover:underline"
          >
            Sign in
            <ArrowRight className="h-3 w-3" />
          </Link>{" "}
          for code review, knowledge, and more.
        </span>
      </div>
    </div>
  );
}
