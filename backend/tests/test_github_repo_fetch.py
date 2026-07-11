"""Tests for GitHub repository fetch helpers."""

from unittest.mock import MagicMock, patch

import pytest

from app.services.github_repo_fetch import (
    GitHubRepoError,
    fetch_repo_zipball,
    get_repo_metadata,
    list_repo_branches,
    normalize_github_repo_url,
    parse_github_repo_url,
)


@pytest.mark.parametrize(
    "url,owner,repo",
    [
        ("https://github.com/foo/bar", "foo", "bar"),
        ("https://github.com/foo/bar.git", "foo", "bar"),
        ("git@github.com:org/my-repo.git", "org", "my-repo"),
        ("CodeWithAnjaliTech/cashflow-tracker", "CodeWithAnjaliTech", "cashflow-tracker"),
    ],
)
def test_parse_github_repo_url(url: str, owner: str, repo: str):
    assert parse_github_repo_url(url) == (owner, repo)


def test_normalize_owner_repo_shorthand():
    assert (
        normalize_github_repo_url("CodeWithAnjaliTech/cashflow-tracker")
        == "https://github.com/CodeWithAnjaliTech/cashflow-tracker"
    )


def test_parse_github_repo_url_invalid():
    with pytest.raises(GitHubRepoError, match="Invalid"):
        parse_github_repo_url("https://gitlab.com/foo/bar")


def test_rejects_username_only():
    with pytest.raises(GitHubRepoError, match="username only"):
        normalize_github_repo_url("CodeWithAnjaliTech")


@patch("app.services.github_repo_fetch.httpx.Client")
def test_get_repo_metadata(mock_client_cls):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "full_name": "foo/bar",
        "default_branch": "develop",
        "description": "A repo",
        "language": "Python",
        "private": False,
    }
    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.get.return_value = mock_resp
    mock_client_cls.return_value = mock_client

    meta = get_repo_metadata("foo", "bar", "token")
    assert meta["full_name"] == "foo/bar"
    assert meta["default_branch"] == "develop"


@patch("app.services.github_repo_fetch.httpx.Client")
def test_list_repo_branches(mock_client_cls):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = [{"name": "main"}, {"name": "dev"}]
    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.get.return_value = mock_resp
    mock_client_cls.return_value = mock_client

    branches = list_repo_branches("foo", "bar", "token")
    assert branches == ["main", "dev"]


@patch("app.services.github_repo_fetch.httpx.Client")
def test_fetch_repo_zipball(mock_client_cls):
    mock_stream = MagicMock()
    mock_stream.status_code = 200
    mock_stream.iter_bytes.return_value = [b"PK\x03\x04", b"content"]

    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.stream.return_value.__enter__.return_value = mock_stream
    mock_client_cls.return_value = mock_client

    data = fetch_repo_zipball("foo", "bar", "main", "token", max_download_mb=1)
    assert data == b"PK\x03\x04content"
