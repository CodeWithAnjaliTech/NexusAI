export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type ExperienceLevel = "beginner" | "intermediate" | "advanced" | "senior";

export interface ReviewFinding {
  severity: Severity;
  file: string | null;
  line: number | null;
  title: string;
  description: string;
  suggestion: string;
}

export interface ReviewCategory {
  name: string;
  score: number;
  findings: ReviewFinding[];
}

export interface ProjectStats {
  file_count: number;
  code_files: number;
  total_lines: number;
  languages: string[];
  frameworks: string[];
}

export interface GitHubReviewSources {
  connected: boolean;
  repo_url: string | null;
  repo_full_name: string | null;
  default_branch: string | null;
  branches: string[];
  username: string | null;
  error?: string | null;
}

export interface CodeReviewReport {
  project_name: string;
  stats: ProjectStats;
  overall_score: number;
  summary: string;
  strengths: string[];
  priorities: string[];
  categories: ReviewCategory[];
  duration_ms: number;
  experience_level?: ExperienceLevel;
  review_source?: {
    type: "github";
    repo_url: string;
    branch: string;
    full_name: string;
  } | null;
}
