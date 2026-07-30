# ---------- Stage 1: build the React front-end ----------
FROM node:20-alpine AS web
WORKDIR /web
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build          # -> /web/dist

# ---------- Stage 2: Python runtime ----------
FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=web /web/dist ./static
ENV DATA_DIR=/app/data
EXPOSE 8000
CMD ["sh","-c","uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
