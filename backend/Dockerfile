# Production FastAPI Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for psycopg2 and build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy backend codebase
COPY backend /app/backend

# Expose FastAPI default port
EXPOSE 8000

ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# Run FastAPI with Uvicorn
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
