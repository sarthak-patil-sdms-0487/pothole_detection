from fastapi import Header, Query
from typing import Optional

DEFAULT_ROLE = "SURVEYOR"
VALID_ROLES = {"SURVEYOR", "ENGINEER"}

def get_current_role(
    x_role: Optional[str] = Header(None, alias="X-Role"),
    role: Optional[str] = Query(None)
) -> str:
    """
    Extracts lightweight role from incoming request via 'X-Role' header or '?role=' query parameter.
    Defaults to 'SURVEYOR' if none or unrecognized role is provided.
    """
    raw_role = x_role or role or DEFAULT_ROLE
    normalized_role = str(raw_role).strip().upper()
    if normalized_role in VALID_ROLES:
        return normalized_role
    return DEFAULT_ROLE
