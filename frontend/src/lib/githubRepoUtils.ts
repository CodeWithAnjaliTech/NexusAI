/** Normalize and validate GitHub owner/repo references for UI forms. */

export function formatGithubRepoRef(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/$/, "");
}

export function isValidGithubRepoRef(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  const shorthand = formatGithubRepoRef(trimmed);
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(shorthand)) return true;

  return /github\.com[/:][A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/i.test(trimmed);
}

export function githubRepoRefError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Enter a repository (owner/repo).";
  if (isValidGithubRepoRef(trimmed)) return null;

  if (!trimmed.includes("/") && !trimmed.includes("github.com")) {
    return `"${trimmed}" is a username only — add /repo-name.`;
  }

  return "Use owner/repo or https://github.com/owner/repo.";
}

/** Pick a valid initial repo ref from settings, or empty if invalid. */
export function initialGithubRepoRef(
  repoFullName: string | null | undefined,
  repoUrl: string | null | undefined,
): string {
  const candidate = formatGithubRepoRef(repoFullName || repoUrl);
  return isValidGithubRepoRef(candidate) ? candidate : "";
}
