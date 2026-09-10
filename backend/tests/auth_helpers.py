"""Shared auth helpers for tests: mint real JWTs so tests exercise the live auth path."""
from src.services import auth_service


def auth_headers(role: str = "ENGINEER", user_id: int = 1) -> dict:
    token = auth_service.create_access_token(user_id, role.upper(), f"{role.lower()}@test.local")
    return {"Authorization": f"Bearer {token}"}
