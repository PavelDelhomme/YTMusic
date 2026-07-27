# Build context = monorepo root
# Image unique efficace : API + SPA (PWA) + WebSocket
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN npm ci

FROM deps AS build
ARG BUILD_SHA=dev
ARG BUILD_REF=local
ENV BUILD_SHA=$BUILD_SHA BUILD_REF=$BUILD_REF
COPY client ./client
COPY server ./server
COPY tsconfig*.json* ./
RUN npm run build -w client

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ARG BUILD_SHA=dev
ARG BUILD_REF=local
ENV NODE_ENV=production \
    PORT=8787 \
    BUILD_SHA=$BUILD_SHA \
    BUILD_REF=$BUILD_REF

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd -r ytmusic && useradd -r -g ytmusic -m ytmusic

COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
# Rebuild native modules (better-sqlite3) for runtime
RUN npm ci --omit=dev \
  && npm install tsx@4 --no-save

COPY server ./server
COPY bin ./bin
COPY --from=build /app/client/dist ./client/dist

RUN mkdir -p /app/data /app/data/cache /app/data/img-cache \
  && chown -R ytmusic:ytmusic /app

USER ytmusic
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8787/api/health || exit 1

CMD ["npx", "tsx", "server/src/index.ts"]
