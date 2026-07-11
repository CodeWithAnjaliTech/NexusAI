import { create } from "zustand";
import type { AgentKey, ChatMessage, ContextSource, GraphEvent, IntentType } from "@/types";

const CONTEXT_SOURCE_KEY = "nexusai-context-source";
const CONTEXT_DOCUMENT_KEY = "nexusai-context-document-id";

function readContextSource(): ContextSource {
  const stored = localStorage.getItem(CONTEXT_SOURCE_KEY);
  if (
    stored === "none" ||
    stored === "github" ||
    stored === "document" ||
    stored === "both" ||
    stored === "auto"
  ) {
    return stored;
  }
  return "none";
}

/** Mode: auto, built-in agent key, or custom:uuid */
export type ChatMode = "auto" | AgentKey | `custom:${string}`;

export const SESSION_STORAGE_KEY = "nexusai-session-id";

export function getStoredSessionId(): string | null {
  return localStorage.getItem(SESSION_STORAGE_KEY);
}

interface ChatState {
  sessionId: string | null;
  projectId: string | null;
  messages: ChatMessage[];
  isLoading: boolean;
  activeAgent: AgentKey | null;
  activeIntent: IntentType | null;
  preferredMode: ChatMode;
  contextSource: ContextSource;
  contextDocumentId: string | null;
  graphEvents: GraphEvent[];
  setSessionId: (id: string) => void;
  setProjectId: (id: string | null) => void;
  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (msg: ChatMessage) => void;
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void;
  removeLastAssistantMessage: () => void;
  setLoading: (loading: boolean) => void;
  setAgentContext: (agent: AgentKey, intent: IntentType) => void;
  setPreferredMode: (mode: ChatMode) => void;
  setContextSource: (source: ContextSource) => void;
  setContextDocumentId: (id: string | null) => void;
  setGraphEvents: (events: GraphEvent[]) => void;
  appendGraphEvent: (event: GraphEvent) => void;
  clearChat: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  sessionId: null,
  projectId: localStorage.getItem("nexusai-project-id"),
  messages: [],
  isLoading: false,
  activeAgent: null,
  activeIntent: null,
  preferredMode: (localStorage.getItem("nexusai-preferred-mode") as ChatMode) || "auto",
  contextSource: readContextSource(),
  contextDocumentId: localStorage.getItem(CONTEXT_DOCUMENT_KEY),
  graphEvents: [],
  setSessionId: (id) => {
    localStorage.setItem(SESSION_STORAGE_KEY, id);
    set({ sessionId: id });
  },
  setProjectId: (id) => {
    if (id) localStorage.setItem("nexusai-project-id", id);
    else localStorage.removeItem("nexusai-project-id");
    set({ projectId: id });
  },
  setMessages: (messages) => set({ messages }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  updateMessage: (id, patch) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),
  removeLastAssistantMessage: () =>
    set((s) => {
      const msgs = [...s.messages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "assistant") {
          msgs.splice(i, 1);
          break;
        }
      }
      return { messages: msgs };
    }),
  setLoading: (loading) => set({ isLoading: loading }),
  setAgentContext: (agent, intent) => set({ activeAgent: agent, activeIntent: intent }),
  setPreferredMode: (mode) => {
    localStorage.setItem("nexusai-preferred-mode", mode);
    set({ preferredMode: mode });
  },
  setContextSource: (source) => {
    localStorage.setItem(CONTEXT_SOURCE_KEY, source);
    set({ contextSource: source });
  },
  setContextDocumentId: (id) => {
    if (id) localStorage.setItem(CONTEXT_DOCUMENT_KEY, id);
    else localStorage.removeItem(CONTEXT_DOCUMENT_KEY);
    set({ contextDocumentId: id });
  },
  setGraphEvents: (events) => set({ graphEvents: events }),
  appendGraphEvent: (event) =>
    set((s) => ({ graphEvents: [...s.graphEvents, event] })),
  clearChat: () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    set({
      sessionId: null,
      messages: [],
      activeAgent: null,
      activeIntent: null,
      graphEvents: [],
    });
  },
}));

interface ThemeState {
  darkMode: boolean;
  toggleDarkMode: () => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  darkMode: false,
  toggleDarkMode: () =>
    set((s) => {
      const next = !s.darkMode;
      setTheme(next);
      return { darkMode: next };
    }),
}));

export function initTheme() {
  const stored = localStorage.getItem("nexusai-theme");
  const dark = stored === "dark";
  setTheme(dark);
}

export function setTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem("nexusai-theme", dark ? "dark" : "light");
  useThemeStore.setState({ darkMode: dark });
}
