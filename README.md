# Lamivi

Lamivi is a browser-based AI image editor inspired by IOPaint workflows and powered by a LaMa inpainting engine.

This README is focused on running Lamivi from Docker Hub using the `latest` image.

## Docker Hub (latest) Quick Start

Image:

`docker.io/sn0wmankr/lamivi:latest`

Default app URL after start:

`http://localhost:18743`

## 1) Pull latest image

```bash
docker pull sn0wmankr/lamivi:latest
```

## 2) Run with GPU (recommended)

```bash
docker run --rm --gpus all -p 18743:18743 sn0wmankr/lamivi:latest
```

Recommended when:
- You have an NVIDIA GPU
- You want faster inpainting/export workflows

Host requirements:
- NVIDIA driver installed on host
- NVIDIA Container Toolkit installed
- For RTX 50-series (sm_120), use an image built with CUDA 12.8 PyTorch wheels (`cu128`)

## 3) Run with CPU (fallback)

```bash
docker run --rm -p 18743:18743 sn0wmankr/lamivi:latest
```

Recommended when:
- No supported GPU is available
- Running on non-NVIDIA environment

## Optional runtime environment variables

```bash
docker run --rm --gpus all -p 18743:18743 \
  -e LAMIVI_DEVICE=auto \
  -e LAMIVI_WORKER_TIMEOUT_MS=600000 \
  -e LAMIVI_BOOT_TIMEOUT_MS=120000 \
  sn0wmankr/lamivi:latest
```

- `LAMIVI_DEVICE=auto|cpu|cuda`
  - `auto`: use GPU if available, fallback to CPU
  - `cpu`: force CPU
  - `cuda`: request GPU
- `LAMIVI_WORKER_TIMEOUT_MS`: worker request timeout
- `LAMIVI_BOOT_TIMEOUT_MS`: worker startup timeout

## Update to newest latest image

```bash
docker pull sn0wmankr/lamivi:latest
docker stop lamivi 2>/dev/null || true
docker rm lamivi 2>/dev/null || true
docker run -d --name lamivi --gpus all -p 18743:18743 sn0wmankr/lamivi:latest
```

If you use CPU-only runtime, remove `--gpus all`.

## Basic health check

After container start:

```bash
curl http://localhost:18743/api/health
```

Check fields like device/cuda availability in response.

## Common issues

### GPU not used

- Confirm host driver and NVIDIA Container Toolkit
- Try `LAMIVI_DEVICE=auto`
- Check `/api/health` response
- On very new GPUs with unsupported PyTorch CUDA kernels, Lamivi falls back to CPU automatically; you can also force CPU with `LAMIVI_DEVICE=cpu`
- If using RTX 5090/50-series, make sure the running image was built with `cu128` wheels and a host driver new enough for CUDA 12.8+

## Project notes

- Main automatic Docker publish target is `dev`
- `latest` is intended for manual release publication
- Website: `https://sn0wman.kr`
