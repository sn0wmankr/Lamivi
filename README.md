# Lamivi

## 한국어 안내

Lamivi는 여러 장 이미지/PDF를 불러와서,
- 브러시로 지울 영역을 칠하고
- AI(LaMa 기반)로 글자/오브젝트를 지우고
- 텍스트를 추가/이동/크기/폰트 조절한 뒤
- PNG/PDF로 내보내는 웹 에디터입니다.

### 가장 쉬운 실행 (권장)

```bash
docker compose up --build
```

접속:
- Lamivi: `http://localhost:8000`
- IOPaint 엔진 컨테이너: `http://localhost:8080`

중요: **IOPaint를 PC에 따로 설치할 필요 없습니다.**
`docker compose`가 Lamivi + IOPaint를 함께 올립니다.

Lamivi is a small self-hosted web editor for:
- Importing **multiple images** or a **PDF** (PDF pages become editable pages)
- Painting a mask to **erase text/objects** via LaMa-style inpainting
- Adding **draggable text overlays** (font / size / color / rotation)
- Exporting the current page as PNG or all pages as a multi-page PDF

This repo is split into:
- `web/`: Vite + React + TypeScript (Konva canvas)
- `server/`: Node.js (Express) API + static hosting

## Dev (local)

If your goal is "no separate IOPaint install", skip local dev and use Docker below.
`docker compose up --build` starts everything together.

Terminal 1 (IOPaint):

```bash
iopaint start --model=lama --device=cpu --port=8080 --host=0.0.0.0
```

Terminal 2 (Server API):

```bash
cd server
npm install
set IOPAINT_URL=http://localhost:8080
npm run dev
```

Terminal 3 (Web):

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:5173`.

The web dev server proxies `/api/*` to `http://localhost:8000`.

## Docker

Recommended (Lamivi + IOPaint):

```bash
docker compose up --build
```

Open:
- Lamivi: `http://localhost:8000`
- IOPaint: `http://localhost:8080`

You do **not** need to install IOPaint manually. It runs as an internal container in the stack.

## Published Docker Image

After pushing to GitHub, a workflow builds and publishes Lamivi to GHCR and optionally Docker Hub:

`ghcr.io/<your-github-username-or-org>/lamivi:latest`

`docker.io/<dockerhub-username>/lamivi:latest`

### Docker Hub publishing setup (GitHub Actions)

Set these in your GitHub repository:

1. **Repository Variable**
   - `DOCKERHUB_USERNAME`: your Docker Hub username
2. **Repository Secret**
   - `DOCKERHUB_TOKEN`: Docker Hub access token (not password)

If these are set, workflow `.github/workflows/docker-publish.yml` also pushes to Docker Hub.

## Notes

- Lamivi server proxies `POST /api/inpaint` to `POST {IOPAINT_URL}/api/v1/inpaint`.
- For best results, keep IOPaint running with `--model=lama`.
