from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from app.config import settings

# 创建数据库引擎
engine = create_async_engine(settings.DATABASE_URL, echo=True)

# 创建会话工厂
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)

# 获取数据库连接的依赖项
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def init_db():
    from app.models.base import Base
    from app.models.user import User
    from app.models.schedule import Schedule
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)