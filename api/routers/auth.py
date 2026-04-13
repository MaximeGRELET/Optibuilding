"""Router — /auth (register + login)."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from api.database import get_db
from api import models
from api.auth import hash_password, verify_password, create_token

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    token: str
    user_id: int
    email: str


@router.post("/register", response_model=AuthResponse)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if len(req.password) < 6:
        raise HTTPException(status_code=422, detail="Mot de passe trop court (min 6 caractères)")
    existing = db.query(models.User).filter(models.User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email déjà utilisé")
    user = models.User(email=req.email, hashed_pw=hash_password(req.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return AuthResponse(token=create_token(user.id, user.email), user_id=user.id, email=user.email)


@router.post("/login", response_model=AuthResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == req.email).first()
    if not user or not verify_password(req.password, user.hashed_pw):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    return AuthResponse(token=create_token(user.id, user.email), user_id=user.id, email=user.email)
