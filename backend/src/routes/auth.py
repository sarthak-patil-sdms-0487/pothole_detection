from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..controllers import auth_controller
from ..config.database import get_db
from ..middlewares.role import get_current_user

router = APIRouter()


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/auth/login")
async def login_route(body: LoginRequest, db: Session = Depends(get_db)):
    return await auth_controller.login(body.email, body.password, db)


@router.get("/auth/me")
async def me_route(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    return await auth_controller.me(current_user, db)
