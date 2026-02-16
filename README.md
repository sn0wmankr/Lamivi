# Lamivi

Lamivi is a small self-hosted web editor for:
- Importing **multiple images** or a **PDF** (PDF pages become editable pages)
- Painting a mask to **erase text/objects** via LaMa-style inpainting
- Adding **draggable text overlays** (font / size / color / rotation)
- Exporting the current page as PNG or all pages as a multi-page PDF

This repo is split into:
- `web/`: Vite + React + TypeScript (Konva canvas)
- `server/`: Node.js (Express) API + static hosting

## Dev (local)

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

## Published Docker Image

After pushing to GitHub, a workflow builds and publishes Lamivi to GHCR:

`ghcr.io/<your-github-username-or-org>/lamivi:latest`

## Notes

- Lamivi server proxies `POST /api/inpaint` to `POST {IOPAINT_URL}/api/v1/inpaint`.
- For best results, keep IOPaint running with `--model=lama`.
