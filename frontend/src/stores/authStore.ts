import { create } from "zustand";
import { API_URL } from "@/lib/utils";

export interface AuthUser {
  id: string;
  email: string;
  display_name: string;
  role?: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser | null) => void;
  logout: () => void;
  loadFromStorage: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  setAuth: (token, user) => {
    localStorage.setItem("nexusai-token", token);
    set({ token, user });
  },
  logout: () => {
    localStorage.removeItem("nexusai-token");
    set({ token: null, user: null });
  },
  loadFromStorage: () => {
    const token = localStorage.getItem("nexusai-token");
    if (!token) return;
    set({ token });
    fetch(`${API_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) {
          localStorage.removeItem("nexusai-token");
          set({ token: null, user: null });
          return null;
        }
        return r.json();
      })
      .then((user) => {
        if (user) set({ user, token });
      })
      .catch(() => {
        localStorage.removeItem("nexusai-token");
        set({ token: null, user: null });
      });
  },
  isAuthenticated: () => Boolean(get().token),
}));

async function fetchMe(token: string): Promise<AuthUser> {
  const me = await fetch(`${API_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!me.ok) throw new Error(await me.text());
  return me.json() as Promise<AuthUser>;
}

export async function login(email: string, password: string) {
  const res = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as { access_token: string };
  const user = await fetchMe(data.access_token);
  useAuthStore.getState().setAuth(data.access_token, user);
  return data.access_token;
}

export async function register(
  email: string,
  password: string,
  displayName: string,
) {
  const res = await fetch(`${API_URL}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      display_name: displayName,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as { access_token: string };
  const user = await fetchMe(data.access_token);
  useAuthStore.getState().setAuth(data.access_token, user);
  return data.access_token;
}
