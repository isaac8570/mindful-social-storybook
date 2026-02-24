#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy.sh — Manual GCP Cloud Run deployment script
# Usage: ./deploy.sh [PROJECT_ID] [REGION]
# Example: ./deploy.sh my-gcp-project us-central1
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
PROJECT_ID="${1:-${GCP_PROJECT_ID:-}}"
REGION="${2:-us-central1}"
SERVICE_NAME="mindful-social-storybook"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# ── Validate ──────────────────────────────────────────────────────────────────
if [[ -z "$PROJECT_ID" ]]; then
  echo "ERROR: GCP_PROJECT_ID is not set."
  echo "Usage: ./deploy.sh <PROJECT_ID> [REGION]"
  echo "   or: export GCP_PROJECT_ID=my-project && ./deploy.sh"
  exit 1
fi

if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  echo "ERROR: GEMINI_API_KEY is not set."
  echo "Get your free key at: https://aistudio.google.com/app/apikey"
  echo "Then: export GEMINI_API_KEY=your_key_here"
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Deploying: ${SERVICE_NAME}"
echo "  Project:   ${PROJECT_ID}"
echo "  Region:    ${REGION}"
echo "  Image:     ${IMAGE}:latest"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Step 1: Authenticate & set project ───────────────────────────────────────
echo ""
echo "[1/5] Setting GCP project..."
gcloud config set project "${PROJECT_ID}"

# ── Step 2: Enable required APIs ─────────────────────────────────────────────
echo ""
echo "[2/5] Enabling required GCP APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  containerregistry.googleapis.com \
  secretmanager.googleapis.com \
  aiplatform.googleapis.com \
  --quiet

# ── Step 3: Store API key in Secret Manager ───────────────────────────────────
echo ""
echo "[3/5] Storing GEMINI_API_KEY in Secret Manager..."
if gcloud secrets describe gemini-api-key --project="${PROJECT_ID}" &>/dev/null; then
  echo "  Secret 'gemini-api-key' already exists — updating..."
  echo -n "${GEMINI_API_KEY}" | gcloud secrets versions add gemini-api-key --data-file=-
else
  echo "  Creating secret 'gemini-api-key'..."
  echo -n "${GEMINI_API_KEY}" | gcloud secrets create gemini-api-key \
    --data-file=- \
    --replication-policy=automatic
fi

# ── Step 4: Build & push Docker image ────────────────────────────────────────
echo ""
echo "[4/5] Building and pushing Docker image..."
COMMIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "manual")

docker build \
  --build-arg VITE_WS_URL=/ws/story \
  -t "${IMAGE}:${COMMIT_SHA}" \
  -t "${IMAGE}:latest" \
  .

docker push "${IMAGE}:${COMMIT_SHA}"
docker push "${IMAGE}:latest"

# ── Step 5: Deploy to Cloud Run ───────────────────────────────────────────────
echo ""
echo "[5/5] Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE}:${COMMIT_SHA}" \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --timeout 300 \
  --set-env-vars "GCP_PROJECT_ID=${PROJECT_ID},GCP_LOCATION=${REGION}" \
  --update-secrets "GEMINI_API_KEY=gemini-api-key:latest" \
  --quiet

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region "${REGION}" \
  --format "value(status.url)")
echo "  ✓ Deployed successfully!"
echo "  URL: ${SERVICE_URL}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
