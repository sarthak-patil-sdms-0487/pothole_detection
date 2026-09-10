"""
Request authorization.

Role is derived ONLY from a verified JWT (Authorization: Bearer <token>), never
from a client-supplied header. Before this, a plain 'X-Role: ENGINEER' header was
trusted, so anyone could act as an engineer — dispatch statutory notices, close
or delete defects — with no credentials at all.

Requests with no token are treated as the lowest-privilege default so genuinely
public actions (a citizen submitting a pothole report) keep working, while every
engineer-gated endpoint still checks role == 'ENGINEER' and now cannot be forged.
An invalid or expired token is rejected outright rather than silently downgraded.
"""
from fastapi import Header, HTTPException
from typing import Optional
import jwt

from ..services import auth_service

DEFAULT_ROLE = "SURVEYOR"
VALID_ROLES = {"SURVEYOR", "ENGINEER", "CITIZEN"}


def _payload_from_header(authorization: Optional[str]) -> Optional[dict]:
    if not authorization:
        return None
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Malformed Authorization header")
    try:
        return auth_service.decode_access_token(parts[1])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired, please sign in again")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication token")


def get_current_role(authorization: Optional[str] = Header(None)) -> str:
    payload = _payload_from_header(authorization)
    if payload is None:
        return DEFAULT_ROLE
    role = str(payload.get("role", "")).strip().upper()
    return role if role in VALID_ROLES else DEFAULT_ROLE


def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    """Full identity for endpoints that need who, not just what role. 401 if absent."""
    payload = _payload_from_header(authorization)
    if payload is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return {
        "id": payload.get("sub"),
        "role": str(payload.get("role", "")).strip().upper(),
        "email": payload.get("email"),
    }
