import { API_URL } from "./utils";
import { useAuthStore } from "@/stores/authStore";
import type { UploadResponse } from "@/types";

export { API_URL };

export function authHeaders(json = true): Record<string, string> {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** Turn fetch/network errors into user-friendly messages. */
export function formatApiError(err: unknown): string {
  if (err instanceof TypeError && /fetch/i.test(err.message)) {
    return "Cannot reach the backend. Start it on port 8000 and check VITE_API_URL.";
  }
  if (err instanceof Error) {
    if (err.message.includes("Failed to fetch")) {
      return "Cannot reach the backend. Start it on port 8000 and check VITE_API_URL.";
    }
    try {
      const parsed = JSON.parse(err.message) as { detail?: string };
      if (parsed.detail) return parsed.detail;
    } catch {
      /* plain text error */
    }
    return err.message.slice(0, 200);
  }
  return "Something went wrong";
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { ...authHeaders(), ...options?.headers },
    });
  } catch (err) {
    throw new Error(formatApiError(err));
  }
  if (!res.ok) {
    const err = await res.text();
    let message = err || `Request failed: ${res.status}`;
    try {
      const parsed = JSON.parse(err) as { detail?: string | unknown };
      if (typeof parsed.detail === "string") message = parsed.detail;
    } catch {
      /* plain text */
    }
    if (res.status >= 500 && message === "Internal Server Error") {
      message = "Server error during code review. Check backend logs and try again.";
    }
    throw new Error(message);
  }
  return res.json();
}

export async function uploadFile(file: File, projectId?: string | null): Promise<UploadResponse> {
  return uploadFileWithProgress(file, projectId);
}

export async function uploadFileWithProgress(
  file: File,
  projectId?: string | null,
  onProgress?: (percent: number) => void
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    if (projectId) form.append("project_id", projectId);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/api/v1/upload`);
    const headers = authHeaders(false);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as UploadResponse);
        } catch {
          reject(new Error("Invalid upload response"));
        }
      } else {
        reject(new Error(xhr.responseText || `Upload failed: ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error(formatApiError(new TypeError("Failed to fetch"))));
    xhr.send(form);
  });
}

export async function fetchDocumentBlob(documentId: string): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1/documents/${documentId}/file`, {
      headers: authHeaders(false),
    });
  } catch (err) {
    throw new Error(formatApiError(err));
  }
  if (!res.ok) throw new Error(`Could not load file (${res.status})`);
  return res.blob();
}

export async function fetchDocumentPreviewText(documentId: string): Promise<{
  text_preview: string;
  char_count: number;
  filename: string;
  mime_type: string;
}> {
  return apiFetch(`/api/v1/documents/${documentId}/preview-text`);
}

export async function reindexDocument(documentId: string): Promise<UploadResponse> {
  return apiFetch(`/api/v1/documents/${documentId}/reindex`, { method: "POST" });
}

export function documentFileUrl(documentId: string): string {
  return `${API_URL}/api/v1/documents/${documentId}/file`;
}

export async function listDocuments(): Promise<UploadResponse[]> {
  return apiFetch<UploadResponse[]>("/api/v1/documents");
}
