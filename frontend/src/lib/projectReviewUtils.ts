const SKIP_DIR_NAMES = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".venv",
  "venv",
  "env",
  "dist",
  "build",
  ".next",
  "coverage",
  ".turbo",
  "target",
  "vendor",
  ".idea",
  ".vscode",
]);

const CODE_EXTENSIONS = new Set([
  ".py",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".cpp",
  ".c",
  ".h",
  ".cs",
  ".php",
  ".rb",
  ".swift",
  ".sql",
  ".css",
  ".scss",
  ".html",
  ".vue",
  ".svelte",
]);

const CONFIG_NAMES = new Set([
  "package.json",
  "requirements.txt",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "docker-compose.yml",
  "Dockerfile",
  "README.md",
  "readme.md",
  ".env.example",
  "tsconfig.json",
  "vite.config.ts",
  "render.yaml",
  "vercel.json",
]);

export function shouldSkipProjectPath(relativePath: string): boolean {
  const parts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.some((part) => SKIP_DIR_NAMES.has(part));
}

export function isReviewableProjectFile(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  if (shouldSkipProjectPath(normalized)) return false;

  const name = normalized.split("/").pop()?.toLowerCase() ?? "";
  const ext = name.includes(".") ? `.${name.split(".").pop()}` : "";
  return CODE_EXTENSIONS.has(ext) || CONFIG_NAMES.has(name);
}

export function filterProjectFiles(files: FileList | File[]): File[] {
  return Array.from(files).filter((file) => {
    const path = file.webkitRelativePath || file.name;
    return isReviewableProjectFile(path);
  });
}

export function getProjectNameFromFiles(files: File[]): string {
  const first = files[0];
  if (!first) return "project";
  const path = (first.webkitRelativePath || first.name).replace(/\\/g, "/");
  return path.split("/")[0] || "project";
}
