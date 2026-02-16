FROM node:20-alpine AS web-build
WORKDIR /src/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:20-alpine AS server-build
WORKDIR /src/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8000

COPY --from=server-build /src/server/package.json /app/server/package.json
COPY --from=server-build /src/server/node_modules /app/server/node_modules
COPY --from=server-build /src/server/dist /app/server/dist
COPY --from=web-build /src/web/dist /app/web/dist

EXPOSE 8000

CMD ["node", "server/dist/index.js"]
