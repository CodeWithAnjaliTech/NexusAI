import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Loader2, Lock, ShieldCheck, Sparkles, Zap } from "lucide-react";
import {
  AuthBrandCompact,
  AuthBrandPanel,
  GuestChatCard,
} from "@/components/auth/AuthBrandPanel";
import {
  AuthFormField,
  PasswordStrength,
} from "@/components/auth/AuthFormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { login, register } from "@/stores/authStore";
import { setTheme } from "@/stores/chatStore";
import { toast } from "@/stores/toastStore";
import { cn } from "@/lib/utils";

function parseErrorMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { detail?: string };
    if (parsed.detail) return parsed.detail;
  } catch {
    /* plain text */
  }
  return raw.slice(0, 200);
}

const TRUST_ITEMS = [
  { icon: Lock, label: "Encrypted" },
  { icon: ShieldCheck, label: "Private" },
  { icon: Zap, label: "Instant access" },
];

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo =
    (location.state as { from?: string } | null)?.from &&
    (location.state as { from?: string }).from !== "/login"
      ? (location.state as { from: string }).from
      : "/dashboard";

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const wasDark = document.documentElement.classList.contains("dark");
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;

    setTheme(false);
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      setTheme(wasDark);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
        toast.success("Welcome back");
      } else {
        await register(email, password, name);
        toast.success("Account created — welcome to NexusAI");
      }
      navigate(returnTo, { replace: true });
    } catch (err) {
      const msg =
        err instanceof Error ? parseErrorMessage(err.message) : "Authentication failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page relative h-dvh max-h-dvh overflow-hidden bg-white text-zinc-950">
      <div className="grid h-full min-h-0 lg:grid-cols-2">
        {/* Left — brand, showcase, guest chat */}
        <div className="auth-fade-up relative hidden h-full min-h-0 overflow-hidden border-r border-zinc-100 lg:block">
          <AuthBrandPanel />
        </div>

        {/* Right — auth form */}
        <div
          className="auth-fade-up relative flex h-full min-h-0 flex-col overflow-hidden bg-white"
          style={{ animationDelay: "80ms" }}
        >
          <div className="shrink-0 border-b border-zinc-100 px-5 py-4 lg:hidden">
            <AuthBrandCompact />
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-5 py-4 sm:px-10 lg:px-14 xl:px-20">
            <div className="w-full max-w-[400px] space-y-5">
              <div className="space-y-1.5 text-center lg:text-left">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-[11px] font-medium text-zinc-600">
                  <Sparkles className="h-3 w-3" />
                  {mode === "login" ? "Welcome back" : "Get started free"}
                </div>
                <h1
                  key={mode}
                  className="auth-form-enter text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl"
                >
                  {mode === "login" ? "Sign in" : "Create account"}
                </h1>
                <p className="text-sm text-zinc-500">
                  {mode === "login"
                    ? "Access your full workspace."
                    : "Unlock every agent in seconds."}
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_2px_24px_-4px_rgba(0,0,0,0.06)] sm:p-6">
                <div className="relative mb-5 grid grid-cols-2 rounded-xl border border-zinc-200 bg-zinc-50 p-1">
                  <div
                    className={cn(
                      "absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-lg bg-white shadow-sm ring-1 ring-black/[0.04] transition-transform duration-300 ease-out",
                      mode === "register" && "translate-x-full",
                    )}
                  />
                  <button
                    type="button"
                    className={cn(
                      "relative z-10 py-2.5 text-sm font-medium transition-colors",
                      mode === "login" ? "text-zinc-950" : "text-zinc-400",
                    )}
                    onClick={() => {
                      setMode("login");
                      setError("");
                    }}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "relative z-10 py-2.5 text-sm font-medium transition-colors",
                      mode === "register" ? "text-zinc-950" : "text-zinc-400",
                    )}
                    onClick={() => {
                      setMode("register");
                      setError("");
                    }}
                  >
                    Sign up
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div key={mode} className="auth-form-enter space-y-3.5">
                    {mode === "register" && (
                      <AuthFormField label="Name" htmlFor="auth-name">
                        <Input
                          id="auth-name"
                          placeholder="How should we call you?"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          required
                          className="auth-input h-10 rounded-xl border-zinc-200 bg-white text-zinc-950 placeholder:text-zinc-400 sm:h-11"
                          disabled={loading}
                        />
                      </AuthFormField>
                    )}
                    <AuthFormField label="Email" htmlFor="auth-email">
                      <Input
                        id="auth-email"
                        type="email"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        className="auth-input h-10 rounded-xl border-zinc-200 bg-white text-zinc-950 placeholder:text-zinc-400 sm:h-11"
                        disabled={loading}
                      />
                    </AuthFormField>
                    <AuthFormField label="Password" htmlFor="auth-password">
                      <PasswordInput
                        id="auth-password"
                        placeholder="Minimum 8 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                        autoComplete={
                          mode === "login" ? "current-password" : "new-password"
                        }
                        className="auth-input h-10 rounded-xl border-zinc-200 bg-white text-zinc-950 placeholder:text-zinc-400 sm:h-11"
                        disabled={loading}
                      />
                      {mode === "register" && (
                        <PasswordStrength password={password} />
                      )}
                    </AuthFormField>
                  </div>

                  {error && (
                    <p className="auth-shake rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                      {error}
                    </p>
                  )}

                  <Button
                    type="submit"
                    className="group h-11 w-full rounded-xl bg-zinc-950 text-sm font-semibold text-white transition-all hover:bg-zinc-800 active:scale-[0.98] sm:h-12"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Please wait
                      </>
                    ) : (
                      <>
                        {mode === "login" ? "Sign in" : "Create account"}
                        <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </>
                    )}
                  </Button>
                </form>

                <div className="mt-5 flex flex-wrap items-center justify-center gap-3 border-t border-zinc-100 pt-4">
                  {TRUST_ITEMS.map(({ icon: TrustIcon, label }) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500"
                    >
                      <TrustIcon className="h-3.5 w-3.5 text-zinc-700" />
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="lg:hidden">
                <GuestChatCard compact />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
