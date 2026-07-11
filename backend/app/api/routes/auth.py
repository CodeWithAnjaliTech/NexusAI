"""Authentication API routes."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_auth
from app.db.models.organization import Organization
from app.db.models.user import User
from app.db.session import get_db
from app.schemas.auth import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from app.services.auth_service import (
    create_access_token,
    get_or_create_default_org,
    get_user_by_email,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    existing = await get_user_by_email(db, body.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    if body.organization_name:
        import uuid as _uuid

        slug = f"{body.organization_name.lower().replace(' ', '-')[:80]}-{_uuid.uuid4().hex[:6]}"
        org = Organization(name=body.organization_name, slug=slug, plan="free")
        db.add(org)
        await db.flush()
    else:
        org = await get_or_create_default_org(db)

    user = User(
        email=body.email,
        display_name=body.display_name,
        hashed_password=hash_password(body.password),
        organization_id=org.id,
        role="admin" if body.organization_name else "member",
    )
    db.add(user)
    await db.flush()

    token = create_access_token(str(user.id), {"org": str(org.id)})
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    user = await get_user_by_email(db, body.email)
    if not user or not user.hashed_password or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    extra = {"org": str(user.organization_id)} if user.organization_id else {}
    return TokenResponse(access_token=create_access_token(str(user.id), extra))


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(require_auth)) -> UserResponse:
    return UserResponse.model_validate(user)
