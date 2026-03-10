# ============================================================
#  NexTo Frontend — Nginx Static Server
#  纯静态 HTML/CSS/JS (Bootstrap + AMap)，直接由 Nginx 托管
# ============================================================
FROM nginx:1.25-alpine

# 清理默认欢迎页
RUN rm -rf /usr/share/nginx/html/*

# 复制静态文件
COPY . /usr/share/nginx/html/

# 自定义 Nginx 配置：支持 SPA 兼容路由 & gzip 压缩
RUN printf 'server {\n\
    listen       80;\n\
    server_name  localhost;\n\
    root         /usr/share/nginx/html;\n\
    index        index.html;\n\
\n\
    gzip on;\n\
    gzip_types text/plain text/css application/javascript application/json;\n\
    gzip_min_length 1024;\n\
\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
\n\
    # 静态资源长缓存\n\
    location ~* \\.(css|js|png|jpg|svg|ico|woff2?)$ {\n\
        expires 7d;\n\
        add_header Cache-Control "public, immutable";\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
