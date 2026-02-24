# ── Stage 1: Build frontend ──────────────────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --legacy-peer-deps

COPY frontend/ ./
ARG VITE_WS_URL=/ws/story
ENV VITE_WS_URL=${VITE_WS_URL}
RUN npm run build

# ── Stage 2: Python backend + serve static ───────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

# Install backend dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ ./

# Copy built frontend into backend static directory
COPY --from=frontend-builder /app/frontend/dist ./static

# Serve frontend from FastAPI
RUN pip install --no-cache-dir aiofiles

EXPOSE 8080

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
