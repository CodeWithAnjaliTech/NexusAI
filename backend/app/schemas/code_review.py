"""Code review API schemas."""

from typing import Literal

from pydantic import BaseModel, Field

from app.services.code_review_levels import ExperienceLevel

Severity = Literal["critical", "high", "medium", "low", "info"]


class ReviewFinding(BaseModel):
    severity: Severity
    file: str | None = None
    line: int | None = None
    title: str
    description: str
    suggestion: str


class ReviewCategory(BaseModel):
    name: str
    score: int = Field(ge=0, le=100)
    findings: list[ReviewFinding] = []


class ProjectStats(BaseModel):
    file_count: int
    code_files: int
    total_lines: int
    languages: list[str]
    frameworks: list[str] = []


class CodeReviewResponse(BaseModel):
    project_name: str
    stats: ProjectStats
    overall_score: int = Field(ge=0, le=100)
    summary: str
    strengths: list[str] = []
    priorities: list[str] = []
    categories: list[ReviewCategory] = []
    duration_ms: int
    review_source: dict | None = None
    experience_level: ExperienceLevel = "intermediate"


class GitHubReviewRequest(BaseModel):
    repo_url: str | None = Field(
        default=None,
        description="GitHub repo URL; defaults to connected repo in Settings",
    )
    branch: str | None = Field(default=None, description="Branch or tag; defaults to repo default branch")
    experience_level: ExperienceLevel = Field(
        default="intermediate",
        description="Developer experience level — tunes review depth and tone",
    )


class GitHubReviewSourcesResponse(BaseModel):
    connected: bool
    repo_url: str | None = None
    repo_full_name: str | None = None
    default_branch: str | None = None
    branches: list[str] = []
    username: str | None = None
    error: str | None = None
