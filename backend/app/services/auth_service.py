from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.user import User
from app.schemas.user import UserCreate, UserLogin, UserResponse
from fastapi import HTTPException, status
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def hash_password(self, password: str) -> str:
        return pwd_context.hash(password)

    async def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        return pwd_context.verify(plain_password, hashed_password)

    async def register_user(self, user: UserCreate) -> UserResponse:
        hashed_password = await self.hash_password(user.password)
        db_user = User(
            email=user.email, 
            username=user.username, 
            hashed_password=hashed_password # 注意：模型里是 hashed_password
        )
        self.db.add(db_user)
        await self.db.commit()
        await self.db.refresh(db_user)
        return UserResponse.model_validate(db_user)

    async def get_user_by_username(self, username: str) -> User:
        result = await self.db.execute(select(User).where(User.username == username))
        return result.scalars().first()

    async def authenticate_user(self, username: str, password: str) -> UserResponse:
        user = await self.get_user_by_username(username)
        if user and await self.verify_password(password, user.hashed_password):
            return UserResponse.model_validate(user)
        return None