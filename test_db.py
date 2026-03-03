import asyncio
from sqlalchemy.ext.asyncio import create_async_engine

# 注意：在宿主机测试连接 docker 容器，host 要用 localhost
# 密码和用户名对应 docker-compose.yml
DATABASE_URL = "postgresql+asyncpg://user:password@localhost:5432/map_schedule"

async def test_connection():
    engine = create_async_engine(DATABASE_URL)
    try:
        async with engine.connect() as conn:
            print("✅ 数据库连接成功！")
    except Exception as e:
        print(f"❌ 连接失败: {e}")
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(test_connection())