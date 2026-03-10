# NexTo — 地图日程提醒应用

> **vibe coding 前端初版** | 全栈项目脚手架，已完成前端 MVP 与容器化编排。

---

## 📐 项目简介

NexTo 是一个基于高德地图 JS API 2.0 + Bootstrap 5 构建的地图日程提醒 Web 应用，支持在地图上直观管理日程，并提供实时路况、智能出行提醒等功能。

后端使用 FastAPI（空壳待完善），数据库采用支持地理空间查询的 PostGIS（PostgreSQL 扩展），缓存层使用 Redis。

```
NexTo/
├── frontend/          # 纯静态前端 (Bootstrap 5 + 高德地图)
│   ├── index.html
│   ├── css/style.css
│   ├── js/app.js
│   ├── Dockerfile     # Nginx:alpine 托管
│   └── .dockerignore
├── backend/           # FastAPI 后端（待开发）
│   └── Dockerfile
├── docker-compose.yml # 一键编排: frontend + backend + db + redis
├── requirements.txt
└── README.md
```

---

## ✅ 已实现的核心功能

### 地图与日程管理
- **点击地图添加日程**：点击任意地图位置弹出新增日程对话框，自动逆地理编码填入地点名称
- **地点名称搜索**：在表单内搜索 POI 地名，弹框内渲染下拉结果
- **日程 CRUD**：新增、编辑、删除日程，持久化到 `localStorage`
- **自定义颜色标签**：6 种颜色标记日程，地图 Marker 与侧边栏卡片同步配色

### 地图展示
- **日程 Marker**：自定义日历图标 Marker，点击弹出 InfoWindow
- **用户位置标记**：蓝色脉冲动画圆点实时显示用户当前位置，每 60 秒自动刷新
- **路线自动绘制**：点击侧边栏日程卡片后，自动在地图上绘制从当前位置到目的地的路线

### 路线规划与出行
- **多出行方式**：驾车、步行、骑行三种出行方式切换，实时重新规划路线
- **路线信息浮层**：地图左下角悬浮面板，显示预计用时、路程距离、预计到达时间、最晚出发时刻
- **实时路况弹窗**：通过高德地图 API 查询当前路况，展示详细出行信息

### 提醒系统
- **定时提醒**：支持提前 0 / 5 / 10 / 15 / 30 / 60 分钟提醒
- **多种提醒方式**：浏览器通知 + 声音提醒（Web Audio API）+ Toast 弹出
- **智能出行提醒**：根据实时路况计算最晚出发时刻，在出发时间前 3 分钟自动触发提醒

### 侧边栏 & 筛选
- **实时过滤**：按全部 / 今日 / 即将到来 / 已过期筛选
- **关键字搜索**：按标题或地点名称搜索日程
- **状态徽标**：已过期 / 即将开始 / 今日 / 即将到来四态可视化标记

---

## 🚀 本地启动指南

### 前提条件

- 安装 [Docker Desktop](https://www.docker.com/products/docker-desktop/)（含 `docker-compose`）

### 一键启动（推荐）

在根目录运行以下命令即可一键拉起前后端所有服务：

```bash
git clone https://github.com/renamoe/NexTo.git
cd NexTo
docker-compose up -d --build
```

启动后访问：

| 服务     | 地址                  | 说明                 |
| -------- | --------------------- | -------------------- |
| 前端     | http://localhost      | 地图日程应用         |
| 后端 API | http://localhost:8000 | FastAPI (待开发)     |
| 数据库   | localhost:5432        | PostGIS / PostgreSQL |
| Redis    | localhost:6379        | 缓存                 |

### 停止服务

```bash
docker-compose down
```

### 仅启动基础设施（本地开发模式）

```bash
# 只启动 DB + Redis，本地运行 FastAPI 与前端静态服务
docker-compose up -d db redis
```

---

## 🔧 技术栈

| 层级   | 技术                                                   |
| ------ | ------------------------------------------------------ |
| 前端   | Bootstrap 5.3 · Bootstrap Icons · 高德地图 JS API 2.0 |
| 后端   | FastAPI · Python 3.10（待开发）                        |
| 数据库 | PostgreSQL 15 + PostGIS 3.3                            |
| 缓存   | Redis 7                                                |
| 容器   | Docker · Nginx:alpine                                  |

---

## 📄 License

MIT
