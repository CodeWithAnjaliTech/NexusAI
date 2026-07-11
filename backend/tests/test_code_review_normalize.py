"""Tests for code review response normalization."""

from app.services.code_review_service import ScanResult, _normalize_review


def test_normalize_review_coerces_object_priorities():
    scan = ScanResult(project_name="demo", files=[], static_notes=[])
    data = {
        "overall_score": 80,
        "summary": "Looks good.",
        "strengths": ["Clear README"],
        "priorities": [
            {
                "name": "Add tests",
                "impact": "Medium",
                "rationale": "No test files found.",
            },
            "Use environment variables for secrets",
        ],
        "categories": [],
    }

    result = _normalize_review(data, scan)

    assert result["priorities"][0].startswith("Add tests:")
    assert result["priorities"][1] == "Use environment variables for secrets"
    assert all(isinstance(item, str) for item in result["priorities"])
