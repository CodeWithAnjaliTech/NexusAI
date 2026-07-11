import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Brain,
  Code2,
  FileCode2,
  MessageSquare,
} from "lucide-react";
import { NexusLogo } from "@/components/auth/AuthAmbient";
import { cn } from "@/lib/utils";

const SHOWCASE_ITEMS = [
  {
    icon: MessageSquare,
    title: "Multi-agent chat",
    headline: "Ask anything. The right specialist answers.",
    description:
      "NexusAI routes your question to code, research, or documentation agents — automatically.",
  },
  {
    icon: FileCode2,
    title: "GitHub code review",
    headline: "Ship with confidence, not guesswork.",
    description:
      "Connect a repo and get security, quality, and architecture feedback.",
  },
  {
    icon: Brain,
    title: "Knowledge & memory",
    headline: "Your docs and conversations, always in context.",
    description:
      "Upload PDFs for RAG search. NexusAI remembers what matters across sessions.",
  },
  {
    icon: Code2,
    title: "Safe playground",
    headline: "Run code without touching your machine.",
    description:
      "Execute Python and 20+ languages in an isolated sandbox — fast and safe.",
  },
];

const FEATURE_TAGS = [
  { icon: MessageSquare, label: "Chat" },
  { icon: FileCode2, label: "Code review" },
  { icon: Brain, label: "Knowledge" },
  { icon: Code2, label: "Playground" },
];

const ROTATE_MS = 5000;

function useShowcaseRotation() {
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(true);
  const [progress, setProgress] = useState(0);

  const goTo = (index: number) => {
    setVisible(false);
    setProgress(0);
    window.setTimeout(() => {
      setActive(index);
      setVisible(true);
    }, 200);
  };

  useEffect(() => {
    setProgress(0);
    const start = Date.now();
    const tick = window.setInterval(() => {
      setProgress(Math.min(((Date.now() - start) / ROTATE_MS) * 100, 100));
    }, 50);
    return () => window.clearInterval(tick);
  }, [active]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActive((i) => {
        setVisible(false);
        setProgress(0);
        window.setTimeout(() => setVisible(true), 200);
        return (i + 1) % SHOWCASE_ITEMS.length;
      });
    }, ROTATE_MS);
    return () => window.clearInterval(interval);
  }, []);

  return { active, visible, goTo, progress, item: SHOWCASE_ITEMS[active] };
}

function ShowcaseDots({
  active,
  goTo,
  progress,
}: {
  active: number;
  goTo: (i: number) => void;
  progress: number;
}) {
  return (
    <div className="flex items-center gap-2">
      {SHOWCASE_ITEMS.map((item, i) => (
        <button
          key={item.title}
          type="button"
          aria-label={`Show ${item.title}`}
          onClick={() => goTo(i)}
          className="relative h-1 overflow-hidden rounded-full bg-zinc-200 transition-all duration-300 hover:bg-zinc-300"
          style={{ width: i === active ? 40 : 8 }}
        >
          {i === active && (
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-zinc-950"
              style={{ width: `${progress}%` }}
            />
          )}
        </button>
      ))}
    </div>
  );
}

export function GuestChatCard({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      to="/"
      className={cn(
        "auth-guest-card group relative block overflow-hidden rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50 transition-all duration-300",
        "hover:border-zinc-950 hover:bg-white hover:shadow-[0_8px_30px_-6px_rgba(0,0,0,0.12)]",
        compact ? "p-4" : "p-5 sm:p-6",
      )}
    >
      <span className="absolute -right-0.5 -top-0.5 rounded-bl-xl rounded-tr-2xl bg-zinc-950 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
        Free
      </span>

      <div className="flex items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-950 text-white shadow-md transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-2 sm:h-12 sm:w-12">
          <MessageSquare className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-950 sm:text-base">
            Open Chat as guest
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
            {compact
              ? "No sign-up — start chatting now ✨"
              : "No account needed — explore chat instantly ✨"}
          </p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-zinc-400 transition-all duration-300 group-hover:translate-x-1 group-hover:text-zinc-950" />
      </div>

      <div className="pointer-events-none absolute -bottom-6 -right-6 h-20 w-20 rounded-full bg-zinc-100 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
    </Link>
  );
}

export function AuthBrandPanel() {
  const { active, visible, goTo, progress, item } = useShowcaseRotation();
  const Icon = item.icon;

  return (
    <div className="relative flex h-full min-h-0 flex-col justify-between overflow-hidden bg-white px-8 py-8 lg:px-12 lg:py-10 xl:px-16">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgb(0 0 0 / 0.04) 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }}
      />

      <div className="auth-fade-up relative flex items-center gap-3">
        <NexusLogo size="md" />
        <div>
          <p className="text-base font-semibold tracking-tight text-zinc-950">NexusAI</p>
          <p className="text-xs text-zinc-500">Polymath workspace</p>
        </div>
      </div>

      <div className="relative flex flex-1 flex-col justify-center py-6 lg:py-8">
        <div
          className={cn(
            "space-y-5 transition-all duration-400 ease-out",
            visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
          )}
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700">
            <Icon className="h-3.5 w-3.5" />
            {item.title}
          </div>

          <h2 className="max-w-md text-2xl font-semibold leading-tight tracking-tight text-zinc-950 xl:text-4xl xl:leading-[1.15]">
            {item.headline}
          </h2>

          <p className="max-w-sm text-sm leading-relaxed text-zinc-500">
            {item.description}
          </p>

          <ShowcaseDots active={active} goTo={goTo} progress={progress} />
        </div>

        <div className="mt-8 lg:mt-10">
          <GuestChatCard />
        </div>
      </div>

      <div className="auth-fade-up relative flex flex-wrap gap-2" style={{ animationDelay: "120ms" }}>
        {FEATURE_TAGS.map(({ icon: TagIcon, label }, i) => (
          <span
            key={label}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors duration-200",
              active === i
                ? "border-zinc-950 bg-zinc-950 text-white"
                : "border-zinc-200 bg-white text-zinc-600",
            )}
          >
            <TagIcon className="h-3.5 w-3.5" />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function AuthBrandCompact() {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2.5">
        <NexusLogo size="sm" />
        <div>
          <p className="text-sm font-semibold text-zinc-950">NexusAI</p>
          <p className="text-[11px] text-zinc-500">Polymath workspace</p>
        </div>
      </div>
    </div>
  );
}
