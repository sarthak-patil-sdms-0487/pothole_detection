from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..schemas.user import User
from ..services import auth_service


async def login(email: str, password: str, db: Session) -> dict:
    email = (email or "").strip().lower()
    user = db.query(User).filter(User.email == email).first()

    # Same response whether the email is unknown or the password is wrong, so the
    # endpoint does not reveal which accounts exist.
    if not user or not auth_service.verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Self-heal legacy SHA-256 accounts into bcrypt on first successful login.
    if auth_service.needs_rehash(user.password_hash):
        user.password_hash = auth_service.hash_password(password)
        db.commit()

    token = auth_service.create_access_token(user.id, user.role, user.email)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "organization": user.organization,
        },
    }


async def me(current_user: dict, db: Session) -> dict:
    user = db.query(User).filter(User.id == int(current_user["id"])).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "organization": user.organization,
    }
