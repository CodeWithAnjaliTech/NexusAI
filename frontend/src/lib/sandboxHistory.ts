export interface SandboxRunEntry {
  id: string;
  language: string;
  code: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  runtime_ms: number;
  ran_at: string;
}

const STORAGE_KEY = "nexusai-sandbox-history";
const MAX_ENTRIES = 20;

export function loadSandboxHistory(): SandboxRunEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SandboxRunEntry[];
  } catch {
    return [];
  }
}

export function pushSandboxHistory(entry: Omit<SandboxRunEntry, "id" | "ran_at">): SandboxRunEntry[] {
  const item: SandboxRunEntry = {
    ...entry,
    id: crypto.randomUUID(),
    ran_at: new Date().toISOString(),
  };
  const next = [item, ...loadSandboxHistory()].slice(0, MAX_ENTRIES);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function clearSandboxHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}
