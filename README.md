## 🚀 快速开始指南

1. 克隆项目：
    ```
    git clone https://github.com/renamoe/NexTo.git
    ```

2. 启动基础设施：

    在根目录运行：
    ```
    docker-compose up -d db redis
    ```
    这会启动数据库。此时你可以用本地的 Python 环境开发 FastAPI，连接 `localhost:5432`。

3. 前端开发：

    进入 `frontend/` 目录。

    运行 `npm install` 然后 `npm run dev`。

4. 后端开发：

    进入 `backend/` 目录。

    创建并切换虚拟环境：
    ```
    conda create -n NexTo python=3.10
    conda activate Nexto
    ```

    安装依赖：
    ```
    pip install -r requirements.txt
    ```

    运行：`uvicorn app.main:app --reload`