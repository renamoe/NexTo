from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import auth, schedules
from app.database import init_db

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 应用启动时执行
    await init_db()  # 初始化数据库
    yield
    # 应用关闭时执行（如果需要）

app = FastAPI(
    title="NexTo API",
    version="0.1.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"status": "ok", "message": "NexTo backend is running"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

app.include_router(auth.router)
app.include_router(schedules.router)