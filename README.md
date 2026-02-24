# 🌱 Sprout — Mindful Social Storybook

> An AI-powered interactive 3D storybook agent that generates real-time, personalized fairy tales for children experiencing anxiety — built for the **Gemini Live Agent Challenge 2026**.

[![Gemini Live API](https://img.shields.io/badge/Gemini-Live%20API-blue)](https://ai.google.dev)
[![Cloud Run](https://img.shields.io/badge/GCP-Cloud%20Run-orange)](https://cloud.google.com/run)
[![Category](https://img.shields.io/badge/Category-Creative%20Storyteller-green)](https://geminiliveagentchallenge.devpost.com)

---

## What is Sprout?

Sprout is a warm, knitted 3D fairy tale companion that listens to a child's fears and instantly creates a personalized, comforting story — delivered as a seamless interleaved stream of **text + AI-generated illustrations + voice narration**, all in real-time.

**Key capabilities:**
- 🎙️ Real-time bidirectional voice conversation (child can interrupt at any time)
- 📖 Interleaved multimodal output: text typewriter + inline Imagen-generated illustrations + audio narration
- 🧶 3D animated character with procedural knit shader reacting to audio volume
- 🔇 Echo cancellation & noise suppression for clean child voice input
- ☁️ Fully hosted on GCP Cloud Run

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (React)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Three.js     │  │  StoryBoard  │  │ AudioControl  │  │
│  │ Sprout (3D)  │  │ Typewriter + │  │ Push-to-Talk  │  │
│  │ Knit Shader  │  │ Fade-in imgs │  │ Echo Cancel   │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
│                    WebSocket (/ws/story)                  │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│              FastAPI Backend (GCP Cloud Run)              │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │              gemini_service.py                   │    │
│  │   Gemini 2.0 Flash Live API (audio + text)       │    │
│  │   Tool Calling → generate_image()                │    │
│  └──────────────────────┬──────────────────────────┘    │
│                          │ Tool Call                      │
│  ┌───────────────────────▼──────────────────────────┐   │
│  │              image_service.py                     │   │
│  │         Vertex AI Imagen 3 REST API               │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TypeScript, TailwindCSS |
| 3D | Three.js, @react-three/fiber, Procedural GLSL Shader |
| Backend | Python 3.11, FastAPI, Uvicorn, WebSockets |
| AI — Voice/Text | Gemini 2.0 Flash Live API (Google GenAI SDK) |
| AI — Images | Vertex AI Imagen 3 (Tool Calling) |
| Deployment | GCP Cloud Run, Docker |

---

## Local Development Setup

### Prerequisites
- Node.js 20+
- Python 3.11+
- A [Gemini API Key](https://aistudio.google.com/app/apikey)
- (Optional) GCP project with Vertex AI enabled for image generation

### 1. Clone the repository
```bash
git clone https://github.com/isaac8570/mindful-social-storybook.git
cd mindful-social-storybook
```

### 2. Backend setup
```bash
cd backend
pip install -r requirements.txt

# Copy and fill in your API keys
cp .env.example .env
# Edit .env: set GEMINI_API_KEY and optionally GCP_PROJECT_ID

# Start the backend
python -m uvicorn main:app --host 0.0.0.0 --port 8080 --reload
```

### 3. Frontend setup
```bash
cd frontend
npm install --legacy-peer-deps

# Start the dev server (proxies /ws to backend automatically)
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google AI Studio API key |
| `GCP_PROJECT_ID` | No* | GCP project for Vertex AI Imagen |
| `GCP_LOCATION` | No | GCP region (default: `us-central1`) |
| `PORT` | No | Server port (default: `8080`) |

*Without `GCP_PROJECT_ID`, image generation falls back to a placeholder.

---

## Testing

Tests run inside Docker (Python 3.11) — no local Python setup needed:

```bash
# Build test image
docker build -f backend/Dockerfile.test -t mindful-storybook-test ./backend

# Run all 26 tests
docker run --rm \
  -e GEMINI_API_KEY=test-key \
  -e GCP_PROJECT_ID= \
  mindful-storybook-test
```

| Suite | Tests | Status |
|---|---|---|
| `test_models.py` | 9 | ✅ |
| `test_health.py` | 2 | ✅ |
| `test_image_service.py` | 4 | ✅ |
| `test_gemini_service.py` | 6 | ✅ |
| `test_websocket_e2e.py` | 5 | ✅ |
| **Total** | **26** | **26/26 passed** |

---

## GCP Cloud Run Deployment

### Option A — One-command script

```bash
export GCP_PROJECT_ID=your-project-id
export GEMINI_API_KEY=your-gemini-key
./deploy.sh
```

The script enables required APIs, stores the key in Secret Manager, builds & pushes the Docker image, and deploys to Cloud Run.

### Option B — Cloud Build

```bash
gcloud builds submit --config cloudbuild.yaml --project your-project-id
```

### Option C — GitHub Actions (CI/CD)

Add these GitHub Secrets to your fork:
- `GCP_PROJECT_ID` — your GCP project ID
- `GCP_SA_KEY` — service account JSON key

Then push to `master` → tests run → auto-deploys to Cloud Run.

### Option D — Manual gcloud

```bash
# Build and push Docker image
docker build --build-arg VITE_WS_URL=/ws/story \
  -t gcr.io/YOUR_PROJECT/mindful-social-storybook .
docker push gcr.io/YOUR_PROJECT/mindful-social-storybook

# Store API key in Secret Manager
echo -n "your_key" | gcloud secrets create gemini-api-key --data-file=-

# Deploy to Cloud Run
gcloud run deploy mindful-social-storybook \
  --image gcr.io/YOUR_PROJECT/mindful-social-storybook \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --update-secrets GEMINI_API_KEY=gemini-api-key:latest \
  --set-env-vars GCP_PROJECT_ID=YOUR_PROJECT \
  --port 8080
```

---

## Project Structure

```
mindful-social-storybook/
├── backend/
│   ├── main.py                 # FastAPI app entry point
│   ├── api/
│   │   ├── router.py           # Route registration
│   │   └── websocket.py        # WebSocket handler
│   ├── services/
│   │   ├── gemini_service.py   # Gemini Live API integration
│   │   └── image_service.py    # Vertex AI Imagen integration
│   ├── models/
│   │   └── message.py          # Pydantic schemas
│   ├── tests/                  # pytest suite (26 tests)
│   ├── Dockerfile.test         # Test-only Docker image
│   ├── pytest.ini
│   └── requirements.txt
├── .github/
│   └── workflows/
│       ├── ci.yml              # Test + build on every push/PR
│       └── deploy.yml          # Auto-deploy to Cloud Run on master
├── frontend/
│   ├── src/
│   │   ├── App.tsx             # Main app + state orchestration
│   │   ├── components/
│   │   │   ├── SproutAgent.tsx # 3D character with knit shader
│   │   │   ├── StoryBoard.tsx  # Typewriter text + fade-in images
│   │   │   └── AudioControl.tsx# Push-to-talk + interrupt button
│   │   └── hooks/
│   │       ├── useWebSocket.ts # WS connection management
│   │       └── useAudio.ts     # Recording + playback queue
│   └── package.json
├── Dockerfile                  # Multi-stage build (Node 20 + Python 3.11)
├── cloudbuild.yaml             # GCP Cloud Build pipeline
├── deploy.sh                   # One-command manual deployment
├── ISSUES.md                   # Known issues tracker
├── plan.md                     # Project planning document
└── README.md
```

---

## Hackathon

Built for the [Gemini Live Agent Challenge 2026](https://geminiliveagentchallenge.devpost.com) — **Creative Storyteller** category.

This project was created during the contest period (Feb–Mar 2026) as a new, original work.
