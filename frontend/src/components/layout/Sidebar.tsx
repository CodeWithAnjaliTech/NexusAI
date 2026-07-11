import {
  Activity,
  BarChart3,
  Brain,
  Code2,
  Database,
  FileCode2,
  FolderKanban,
  LayoutDashboard,
  Lock,
  MessageSquare,
  Settings,
} from "lucide-react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ThemeToggle } from "@/components/layout/PageHeader";
import { AUTH_LOGIN_PATH, pathRequiresAuth } from "@/lib/authRoutes";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Workspace" },
  { to: "/", icon: MessageSquare, label: "Chat" },
  { to: "/sandbox", icon: Code2, label: "Playground" },
  { to: "/code-review", icon: FileCode2, label: "Code review" },
  { to: "/agents", icon: Activity, label: "Agents" },
  { to: "/projects", icon: FolderKanban, label: "Projects" },
  { to: "/knowledge", icon: Database, label: "Knowledge" },
  { to: "/memory", icon: Brain, label: "Memory" },
  { to: "/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const location = useLocation();
  const isGuest = !token;

  return (
    <aside className="hidden h-full w-60 flex-col border-r border-border bg-card md:flex">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <span className="text-sm font-bold">N</span>
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">NexusAI</p>
            <p className="mt-1 text-xs text-muted-foreground">Polymath Workspace</p>
          </div>
        </div>
        <ThemeToggle />
      </div>

      {isGuest && (
        <div className="border-b border-border px-3 py-2.5">
          <p className="text-[11px] leading-snug text-muted-foreground">
            Guest — <span className="text-foreground">Chat</span> only.{" "}
            <Link to={AUTH_LOGIN_PATH} className="underline underline-offset-2">
              Sign in
            </Link>{" "}
            for full access.
          </p>
        </div>
      )}

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3 scrollbar-thin">
        {navItems.map(({ to, icon: Icon, label }) => {
          const locked = isGuest && pathRequiresAuth(to);
          const isActive =
            to === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(to);

          if (locked) {
            return (
              <Link
                key={to}
                to={AUTH_LOGIN_PATH}
                state={{ from: to }}
                className="flex h-10 items-center gap-3 rounded-lg px-3 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Sign in to unlock"
              >
                <Icon className="h-4 w-4 shrink-0 opacity-60" />
                <span className="flex-1 text-sm font-medium leading-none opacity-80">
                  {label}
                </span>
                <Lock className="h-3 w-3 shrink-0 opacity-50" />
              </Link>
            );
          }

          return (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive: navActive }) =>
                cn(
                  "flex h-10 items-center gap-3 rounded-lg px-3 transition-colors",
                  (navActive || isActive)
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="text-sm font-medium leading-none">{label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-border p-4">
        {user && token ? (
          <>
            <p className="truncate text-xs font-medium">{user.display_name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
            <button
              type="button"
              onClick={logout}
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Sign out
            </button>
          </>
        ) : (
          <Link
            to={AUTH_LOGIN_PATH}
            state={{ from: location.pathname === "/" ? "/dashboard" : location.pathname }}
            className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground"
          >
            Sign in
          </Link>
        )}
      </div>
    </aside>
  );
}
