# Lamivi

## 한국어

Lamivi는 **LaMa 엔진이 내장된** 이미지/PDF 편집 도구입니다.

- 여러 장 이미지 + PDF(페이지 분리) 불러오기
- 브러시로 지울 영역 마스킹
- LaMa 기반 AI 지우기
- 텍스트 추가/드래그/폰트/크기/색/회전 조절
- PNG/PDF 내보내기

중요: `docker compose` 한 번으로 Lamivi 실행/테스트가 가능합니다.

### 빠른 실행 (권장)

```bash
docker compose up --build
```

접속: `http://localhost:8000`

---

## English

Lamivi is an **integrated LaMa-based** image/PDF editor.

- Multi-image + PDF import (PDF pages become editable pages)
- Brush mask for erase regions
- AI erase using embedded LaMa engine
- Add draggable text (font/size/color/rotation)
- Export PNG/PDF

Important: `docker compose` is enough to run and test Lamivi.

### Quick Start (recommended)

```bash
docker compose up --build
```

Open: `http://localhost:8000`

## Local Dev (optional)

### Server

Requirements: Node.js 20+, Python 3.10+, pip

```bash
cd server
npm install
npm run dev
```

### Web

```bash
cd web
npm install
npm run dev
```

Open: `http://localhost:5173`

## Docker Image Publishing

Workflow: `.github/workflows/docker-publish.yml`

Published targets:
- `docker.io/<dockerhub-username>/lamivi:latest`
- `docker.io/<dockerhub-username>/lamivi:dev`

For Docker Hub publishing, set:
1. Repository Variable: `DOCKERHUB_USERNAME`
2. Repository Secret: `DOCKERHUB_TOKEN`

Pull example:

```bash
docker pull docker.io/<dockerhub-username>/lamivi:dev
```
