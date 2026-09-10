"""
Authentication: password hashing and JWT issue/verify.

Passwords are stored as bcrypt hashes. The users seeded before real auth
existed carried unsalted SHA-256 digests, which are not safe; verify_password
transparently accepts a legacy SHA-256 match once and the login flow re-hashes
it with bcrypt, so old accounts keep working and self-heal on first sign-in.
"""
import hashlib
import datetime
import bcrypt
import jwt

from ..config.settings import get_settings

settings = get_settings()

ALGORITHM = "HS256"
TOKEN_TTL_HOURS = 12


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _is_bcrypt(stored: str) -> bool:
    return stored.startswith(("$2a$", "$2b$", "$2y$"))


def verify_password(plain: str, stored: str) -> bool:
    """True if `plain` matches `stored`, whether bcrypt or a legacy SHA-256 digest."""
    if not stored:
        return False
    if _is_bcrypt(stored):
        try:
            return bcrypt.checkpw(plain.encode("utf-8"), stored.encode("utf-8"))
        except ValueError:
            return False
    # Legacy path: unsalted SHA-256, kept only so pre-auth seed accounts still log in.
    return hashlib.sha256(plain.encode("utf-8")).hexdigest() == stored


def needs_rehash(stored: str) -> bool:
    """A stored digest that is not bcrypt should be upgraded on next successful login."""
    return not _is_bcrypt(stored)


def create_access_token(user_id: int, role: str, email: str) -> str:
    now = datetime.datetime.utcnow()
    payload = {
        "sub": str(user_id),
        "role": role,
        "email": email,
        "iat": now,
        "exp": now + datetime.timedelta(hours=TOKEN_TTL_HOURS),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Return the token payload, or raise jwt.PyJWTError on any problem."""
    return jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
