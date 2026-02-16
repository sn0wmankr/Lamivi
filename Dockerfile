FROM node:20-bookworm-slim AS web-build
WORKDIR /src/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:20-bookworm-slim AS server-build
WORKDIR /src/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8000

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
  && rm -rf /var/lib/apt/lists/*

RUN python3 -m pip install --no-cache-dir --break-system-packages \
    --index-url https://download.pytorch.org/whl/cpu \
    torch torchvision \
  && python3 -m pip install --no-cache-dir --break-system-packages \
    simple-lama-inpainting==0.1.2 pillow==9.5.0 numpy==1.26.4

COPY --from=server-build /src/server/package.json /app/server/package.json
COPY --from=server-build /src/server/node_modules /app/server/node_modules
COPY --from=server-build /src/server/dist /app/server/dist
COPY --from=web-build /src/web/dist /app/web/dist

EXPOSE 8000

CMD ["node", "server/dist/index.js"]
