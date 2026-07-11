import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AuthFormFieldProps {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  hint?: string;
}

export function AuthFormField({ label, htmlFor, children, hint }: AuthFormFieldProps) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-xs font-medium text-zinc-700"
      >
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;

  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  const labels = ["Weak", "Fair", "Good", "Strong"];
  const label = labels[Math.min(score, 3)] ?? "Weak";

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-300",
              i < score ? "bg-primary" : "bg-border",
            )}
          />
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">Password strength: {label}</p>
    </div>
  );
}
