import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthRequiredRoute } from "@/components/auth/AuthRequiredRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { DashboardPage } from "@/pages/DashboardPage";
import { ChatPage } from "@/pages/ChatPage";
import { AgentsPage } from "@/pages/AgentsPage";
import { KnowledgePage } from "@/pages/KnowledgePage";
import { MemoryPage } from "@/pages/MemoryPage";
import { AnalyticsPage } from "@/pages/AnalyticsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { LoginPage } from "@/pages/LoginPage";
import { SandboxPage } from "@/pages/SandboxPage";
import { ProjectsPage } from "@/pages/ProjectsPage";
import { CodeReviewPage } from "@/pages/CodeReviewPage";
import { Toaster } from "@/components/ui/Toaster";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppLayout />}>
            <Route index element={<ChatPage />} />
            <Route element={<AuthRequiredRoute />}>
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="agents" element={<AgentsPage />} />
              <Route path="knowledge" element={<KnowledgePage />} />
              <Route path="memory" element={<MemoryPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="sandbox" element={<SandboxPage />} />
              <Route path="code-review" element={<CodeReviewPage />} />
              <Route path="projects" element={<ProjectsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
