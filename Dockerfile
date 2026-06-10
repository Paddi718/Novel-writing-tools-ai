# === 构建阶段：安装 Python 依赖 ===
FROM python:3.13-slim AS builder

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt


# === 运行阶段 ===
FROM python:3.13-slim

# 构建参数（默认不安装 Claude CLI）
ARG INSTALL_CLAUDE_CLI=false

WORKDIR /app

# 基础系统依赖
RUN apt-get update -o Acquire::Retries=3 \
    && apt-get install -y --no-install-recommends curl \
    && if [ "$INSTALL_CLAUDE_CLI" = "true" ]; then \
         curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
         && apt-get install -y nodejs; \
       fi \
    && rm -rf /var/lib/apt/lists/*

# 安装 Claude CLI（仅 INSTALL_CLAUDE_CLI=true 时）
RUN if [ "$INSTALL_CLAUDE_CLI" = "true" ]; then \
         npm install -g @anthropic-ai/claude-code \
         && npm cache clean --force; \
    fi

# 复制 Python 依赖
COPY --from=builder /usr/local/lib/python3.13/site-packages /usr/local/lib/python3.13/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# 复制应用代码
COPY run.py .
COPY app/ ./app/
COPY static/ ./static/

# 创建数据目录 + 默认设置文件
RUN mkdir -p /app/data \
    && echo '{"provider":"claude","temperature":0.8,"api_key":"","api_base":"","model":"","max_tokens":4096,"target_length":2000}' > /app/settings.json

# 创建非 root 用户
RUN groupadd -r app && useradd -r -g app -d /app -s /sbin/nologin app \
    && chown -R app:app /app

ENV HOME=/app

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -sS http://127.0.0.1:8001/api/novels || exit 1

USER app

CMD ["python", "run.py"]
