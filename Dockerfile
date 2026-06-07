# ---- Build stage ----
FROM python:3.13-slim AS builder

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ---- Runtime stage ----
FROM python:3.13-slim

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.13/site-packages /usr/local/lib/python3.13/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code
COPY run.py .
COPY app/ ./app/
COPY static/ ./static/

# Create data directory (will be mounted as volume)
RUN mkdir -p /app/data

# Default settings (can be overridden by volume mount)
RUN echo '{"provider":"claude","temperature":0.8,"api_key":"","api_base":"","model":"","max_tokens":4096,"target_length":2000}' > /app/settings.json

EXPOSE 8001

CMD ["python", "run.py"]
