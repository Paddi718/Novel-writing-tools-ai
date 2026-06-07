# ---- Build stage ----
FROM python:3.13-slim AS builder

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ---- Runtime stage ----
FROM python:3.13-slim

WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.13/site-packages /usr/local/lib/python3.13/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code
COPY run.py .
COPY app/ ./app/
COPY static/ ./static/

# Create data directory (will be mounted as volume)
RUN mkdir -p /app/data

# Create non-root user
RUN groupadd -r app && useradd -r -g app -d /app -s /sbin/nologin app \
    && chown -R app:app /app

# Default settings (can be overridden by volume mount)
RUN echo '{"provider":"claude","temperature":0.8,"api_key":"","api_base":"","model":"","max_tokens":4096,"target_length":2000}' > /app/settings.json

EXPOSE 8001

# Healthcheck: verify HTTP response
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -sS http://127.0.0.1:8001/api/novels || exit 1

USER app

CMD ["python", "run.py"]
