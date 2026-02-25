# Known Issues & TODO

> 작업 중 발견된 문제점들을 모아두는 파일. 나중에 한번에 처리.

---

## 🔴 Critical

### [ENV-001] Python 3.8 로컬 환경 — google-genai 설치 불가
- **현상:** 로컬 환경이 Python 3.8.10이라 `google-genai>=1.0.0` 설치 불가 (requires Python >=3.9)
- **영향:** 로컬에서 직접 `pytest` 실행 불가. Docker 안에서만 테스트 가능.
- **임시 해결:** `backend/Dockerfile.test` (Python 3.11) 안에서 테스트 실행
- **근본 해결:** 로컬에 Python 3.11+ 설치 또는 pyenv 사용

### [ENV-002] gcloud CLI 미설치
- **현상:** `gcloud` 명령어 없음 → GCP Cloud Run 직접 배포 불가
- **영향:** `gcloud run deploy` 명령 실행 불가
- **임시 해결:** `cloudbuild.yaml` + GitHub Actions로 CI/CD 자동화
- **근본 해결:** `curl https://sdk.cloud.google.com | bash` 로 gcloud 설치

### ~~[ENV-003] Gemini API 키 free_tier quota = 0~~ ✅ RESOLVED
- **해결:** GCP billing 연결 완료
- **추가 발견 및 수정:**
  - `gemini-2.0-flash` / `gemini-2.0-flash-001` → 신규 사용자 deprecated, `gemini-2.5-flash-native-audio-latest` 로 교체
  - `system_instruction` 타입 → `str` 대신 `types.Content(parts=[types.Part(text=...)])` 로 수정
  - `connect().__aenter__()` 직접 호출 불가 → background task + `asyncio.Event` 패턴으로 세션 유지 구조 재설계
- **검증:** 실제 WebSocket E2E 테스트 통과 — 오디오 청크 실시간 스트리밍 확인 (`seq=1~5, 61440 bytes`)

---

## 🟡 Medium

### [DEP-001] pytest-asyncio 버전 호환성
- **현상:** Docker 내 `pytest-asyncio==1.3.0` 설치됨 (최신). `asyncio_mode = auto` 설정 필요.
- **영향:** `@pytest.mark.asyncio` 없이도 async 테스트 실행되어야 함
- **상태:** pytest.ini에 `asyncio_mode = auto` 설정 완료

### [DEP-002] google-cloud-aiplatform 의존성 무거움
- **현상:** `google-cloud-aiplatform==1.74.0`이 grpcio, numpy, shapely 등 대형 패키지를 끌어옴
- **영향:** Docker 이미지 빌드 시간 증가 (~20초), 이미지 크기 증가
- **근본 해결:** Vertex AI Imagen 대신 Gemini API의 이미지 생성 기능 사용 시 제거 가능

### [FRONTEND-001] 번들 크기 경고 (1MB+)
- **현상:** `dist/assets/index-*.js` 가 1,014 kB (gzip 283 kB). Vite 권장 500 kB 초과.
- **원인:** Three.js + @react-three/fiber + @react-three/drei 가 단일 청크에 묶임
- **영향:** 초기 로딩 속도 저하 (특히 모바일)
- **해결:** `vite.config.ts`에 `manualChunks`로 three.js 분리 + dynamic import 적용

---

## 🟢 Low / Nice-to-have

### [UX-001] WebSocket 재연결 로직 없음
- **현상:** `useWebSocket.ts`에 자동 재연결(reconnect) 로직 없음
- **영향:** 네트워크 끊김 시 수동으로 새로고침 필요
- **해결:** exponential backoff 재연결 로직 추가

### [UX-002] 오디오 포맷 불일치 가능성
- **현상:** 브라우저 MediaRecorder는 `audio/webm;codecs=opus`로 녹음하지만, Gemini Live API는 `audio/pcm;rate=16000` 기대
- **영향:** 실제 음성 인식 품질 저하 가능
- **해결:** AudioWorklet으로 PCM 변환 후 전송하는 방식으로 개선 필요

### [DEPLOY-001] Cloud Run 최소 인스턴스 0 설정 시 Cold Start
- **현상:** `min-instances=0`이면 첫 요청 시 cold start (~3-5초)
- **영향:** 첫 WebSocket 연결 지연
- **해결:** `min-instances=1` 설정 (비용 증가)

---

## 📋 TODO (다음 작업)

### 🔴 Critical (사용자 피드백)
1. **음성 인식 안 됨** — 마이크 버튼 눌러도 Sprout가 사용자 음성을 인식 못함. 백엔드 연결 또는 오디오 포맷 문제 확인 필요
2. **Sprout 음성 출력 안 됨** — Sprout가 아무 말도 안 함. 오디오 재생 로직 확인 필요
3. **UX 혼란** — 버튼을 누르는 동안 말해야 하는지, 손을 떼야 하는지, 듣고 있는지 알 수 없음. 명확한 시각적 피드백 필요
4. **모바일 레이아웃 깨짐** — 일부 브라우저에서 버튼이 안 보임. 반응형 CSS 점검 필요

### 🟡 Medium
5. **Sprout 캐릭터 디자인 개선** — 현재 디자인이 마음에 안 듦. 더 현대적이고 귀여운 디자인 필요
6. **데모 영상 촬영** — 해커톤 제출용 (<4분)

### 🟢 선택
7. **번들 크기 최적화** — Three.js 코드 스플리팅 (1MB → ~300KB)
8. **WebSocket 재연결 로직** — 네트워크 끊김 시 자동 재연결
9. **오디오 포맷 최적화** — WebM → PCM 변환 (음성 인식 품질 향상)

---

## ✅ Resolved

- requirements.txt 버전 고정 완료 (google-genai==1.9.0)
- GeminiService에서 GEMINI_API_KEY 없을 때 명확한 에러 메시지 추가
- GeminiSession의 Optional 타입 힌트 수정 (Python 3.9 호환)
- Gemini Live API 실제 연결 및 오디오 스트리밍 검증 완료
- Live 모델 `gemini-2.5-flash-native-audio-latest` 로 업데이트
- GeminiSession 세션 유지 구조 재설계 (background task + asyncio.Event)
- **GCP Cloud Run 배포 완료** — https://mindful-social-storybook-4rlenzpjoa-uc.a.run.app
- **R3F v9 업그레이드** — React 19 호환성 문제 해결
- **언어 선택 기능** — 한국어/English 토글 추가
