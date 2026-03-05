import os

class Settings:
    # 数据库配置
    DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://user:password@localhost:5432/map_schedule")
    REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
    # JWT 配置
    SECRET_KEY = os.getenv("SECRET_KEY", "123456")
    ALGORITHM = os.getenv("ALGORITHM", "HS256")
    EXPIRE_MINUTES = int(os.getenv("EXPIRE_MINUTES", "60"))

settings = Settings()