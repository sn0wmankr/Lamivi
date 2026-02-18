# Lamivi

Lamivi is a browser-based AI image editing tool inspired by the practical workflow of IOPaint and powered by a built-in LaMa inpainting engine.

Website: `https://sn0wman.kr`

## English

### What Lamivi is

Lamivi focuses on fast, local-first editing for image restoration and cleanup:

- Paint a region, release the mouse, and run AI restore immediately
- Edit text layers directly on canvas (font, size, color, weight, italic, rotation, alignment)
- Crop visually or with exact numeric controls
- Import many images at once, and split PDFs into pages automatically
- Export to PNG, JPG, WEBP, PDF, and PPTX (current file, selected files, or all files)

Recent workflow improvements:

- Move tool (`M`) for canvas panning
- Zoom dock on preview bottom-right with `+ / - / % / slider`
- `Ctrl + mouse wheel` zoom on canvas
- Upscale ratios for export: `1x`, `2x`, `4x`, `8x`
- Export filename policy: original filename + `_lamivi` suffix

Lamivi is designed for creators and operators who need a practical inpainting toolchain with modern editing controls in one place.

### Product direction

- Inspired by IOPaint-style usability (fast brush-based editing loop)
- Built around LaMa-based inpainting for high-quality content-aware fill
- Docker-first runtime for reproducible local/remote deployment

### Default experience (release baseline)

Current default settings for first-time users:

- Default brush size: `150`
- Autosave interval: `60` seconds
- Animation intensity: `High`
- Quick start guide: `Enabled`

Saved preferences in local storage still override defaults for returning users.

### Quick controls

- `B`: AI Restore
- `E`: AI Eraser
- `T`: Text
- `C`: Crop
- `M`: Move (pan canvas)
- `Ctrl + mouse wheel`: Zoom in/out

## Quick Start (Docker)

```bash
docker compose up --build
```

Open: `http://localhost:18743`

## Docker Runtime

### Build local image

```bash
docker build -t lamivi:local -f Dockerfile .
```

### Run with GPU (preferred)

```bash
docker run --rm --gpus all -p 18743:18743 lamivi:local
```

Requires NVIDIA driver + NVIDIA Container Toolkit on the host.

### Run with CPU fallback

```bash
docker run --rm -p 18743:18743 lamivi:local
```

### Runtime environment variables

- `LAMIVI_DEVICE=auto|cpu|cuda`
- `LAMIVI_PYTHON=/opt/venv-lama/bin/python`
- `LAMIVI_WORKER_TIMEOUT_MS=600000`
- `LAMIVI_BOOT_TIMEOUT_MS=120000`

### GPU compatibility notes

- Runtime image uses CUDA `12.4` and PyTorch `cu124` wheels.
- If `LAMIVI_DEVICE=cuda` is requested but CUDA is unavailable, Lamivi falls back to CPU and reports a warning.

## DockerHub Publishing Reference

This repository includes GitHub Actions for Docker Hub publishing:

- Workflow: `.github/workflows/docker-publish.yml`
- Target image pattern: `docker.io/<DOCKERHUB_USERNAME>/lamivi`
- Main branch pushes publish `latest`, `dev`, and SHA tags

## Local Development

### Full stack

```bash
npm install
npm run build
```

### Web only

```bash
cd web
npm install
npm run dev
```

### Server only

```bash
cd server
npm install
npm run dev
```

## Add a New Language

Language options live in `web/src/App.tsx`:

1. Add a new item in `LANGUAGE_OPTIONS` (`code`, `label`, `flag`).
2. Add a new locale block under `UI` with the same keys as existing locales.
3. Extend `SUPPORTED_LOCALES` with the new locale code.

## Korean

Lamivi는 IOPaint의 실용적인 작업 흐름에서 영감을 받아, LaMa 엔진 기반 복원을 중심으로 만든 브라우저형 AI 이미지 편집 도구입니다.

- 브러시로 칠한 뒤 마우스를 놓으면 즉시 AI 복원 실행
- 텍스트 레이어 편집(글꼴/크기/색상/굵기/기울임/회전/정렬)
- 시각적/수치 기반 잘라내기
- 다중 이미지 및 PDF 페이지 자동 분리 불러오기
- PNG/JPG/WEBP/PDF/PPTX 내보내기 (현재 파일/선택 파일/전체 파일)

최근 작업 흐름 개선:

- 이동 도구(`M`)로 캔버스 패닝
- 미리보기 우측 하단 확대/축소 도크
- 캔버스에서 `Ctrl + 마우스 휠` 확대/축소
- 내보내기 배율 `1x`, `2x`, `4x`, `8x`
- 파일명: 원본명 + `_lamivi` 접미사
