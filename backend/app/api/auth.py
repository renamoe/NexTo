from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas.user import UserCreate, UserLogin, UserResponse
from app.schemas.response import Response
from app.services.auth_service import AuthService
from app.database import get_db
from app.utils.responses import success_response, error_response
from app.utils.jwt import create_access_token

router = APIRouter(
    prefix="/auth",
    tags=["auth"]
)

@router.post("/register", response_model=Response)
async def register(user: UserCreate, db: AsyncSession = Depends(get_db)):
    service = AuthService(db)
    existing_user = await service.get_user_by_username(user.username)
    if existing_user:
        raise HTTPException(status_code=400, detail="用户名已被占用")
    
    new_user = await service.register_user(user)
    return success_response(data=new_user, message="注册成功")

@router.post("/login", response_model=Response)
async def login(user: UserLogin, db: AsyncSession = Depends(get_db)):
    service = AuthService(db)
    auth_user = await service.authenticate_user(user.username, user.password)
    if not auth_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="用户名不存在或密码错误")
    token = create_access_token({"sub": auth_user.username})
    return success_response(
        data={"access_token": token, "token_type": "bearer", "user": auth_user},
        message="登录成功",
    )

@router.post("/logout")
async def logout():
    # 如果使用 JWT，后端通常不需要处理状态，前端删除 Token 即可
    return success_response(message="登出成功")