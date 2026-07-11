/** Code review experience levels — tunes AI review depth and tone. */

export type ExperienceLevel = "beginner" | "intermediate" | "advanced" | "senior";

export const CODE_REVIEW_LEVEL_KEY = "nexusai-code-review-level";

export const EXPERIENCE_LEVELS: {
  value: ExperienceLevel;
  label: string;
  description: string;
}[] = [
  {
    value: "beginner",
    label: "Beginner",
    description: "Friendly explanations, fundamentals, and encouraging feedback",
  },
  {
    value: "intermediate",
    label: "Intermediate",
    description: "Balanced professional review with best practices",
  },
  {
    value: "advanced",
    label: "Advanced",
    description: "Architecture, patterns, performance, and edge cases",
  },
  {
    value: "senior",
    label: "Senior",
    description: "Staff-level systems thinking and strategic trade-offs",
  },
];

export function loadExperienceLevel(): ExperienceLevel {
  const stored = localStorage.getItem(CODE_REVIEW_LEVEL_KEY);
  if (
    stored === "beginner" ||
    stored === "intermediate" ||
    stored === "advanced" ||
    stored === "senior"
  ) {
    return stored;
  }
  return "intermediate";
}

export function saveExperienceLevel(level: ExperienceLevel): void {
  localStorage.setItem(CODE_REVIEW_LEVEL_KEY, level);
}

export function experienceLevelLabel(level: ExperienceLevel): string {
  return EXPERIENCE_LEVELS.find((l) => l.value === level)?.label ?? level;
}
