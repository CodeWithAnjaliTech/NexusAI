export interface SandboxFixPayload {
	code: string;
	stderr: string;
	language: string;
}

const STORAGE_KEY = "nexusai-pending-sandbox-fix";

/** Survives StrictMode remounts within the same navigation. */
let fixInFlight = false;

export function setPendingSandboxFix(payload: SandboxFixPayload): void {
	sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function peekPendingSandboxFix(): SandboxFixPayload | null {
	const raw = sessionStorage.getItem(STORAGE_KEY);
	if (!raw) return null;
	try {
		return JSON.parse(raw) as SandboxFixPayload;
	} catch {
		return null;
	}
}

export function hasPendingSandboxFix(): boolean {
	return peekPendingSandboxFix() !== null || fixInFlight;
}

export function tryBeginSandboxFix(): SandboxFixPayload | null {
	if (fixInFlight) return null;
	const fix = peekPendingSandboxFix();
	if (!fix) return null;
	fixInFlight = true;
	return fix;
}

export function finishSandboxFix(): void {
	fixInFlight = false;
	sessionStorage.removeItem(STORAGE_KEY);
}
