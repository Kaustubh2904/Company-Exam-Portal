# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app

# Install build deps (psycopg binary needs libpq)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq-dev \
        gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies into a prefix directory
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

WORKDIR /app

# Runtime libpq only (no compiler)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application source
COPY . .

# Non-root user for security
RUN useradd --no-create-home --shell /bin/false appuser \
    && mkdir -p /app/static/logos \
    && chown -R appuser:appuser /app \
    && chmod +x /app/entrypoint.sh
USER appuser

# Expose API port
EXPOSE 8000

# Run migrations first (single process), then start uvicorn workers
CMD ["/app/entrypoint.sh"]
