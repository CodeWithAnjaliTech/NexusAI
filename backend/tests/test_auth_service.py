"""Tests for password hashing (bcrypt, no passlib)."""

from app.services.auth_service import hash_password, verify_password


def test_hash_and_verify_password():
    hashed = hash_password("my-secret-password")
    assert hashed.startswith("$2")
    assert verify_password("my-secret-password", hashed)
    assert not verify_password("wrong-password", hashed)


def test_verify_rejects_invalid_hash():
    assert not verify_password("password", "not-a-valid-hash")
