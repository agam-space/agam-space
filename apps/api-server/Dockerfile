# --- 1. Builder Stage: Build source files ---
FROM node:25-bullseye-slim AS builder

WORKDIR /app

RUN apt-get update && \
  apt-get install -y --no-install-recommends python3 make g++ && \
  npm install -g npm@11.7.0 pnpm && \
  rm -rf /var/lib/apt/lists/*

COPY . .

RUN find . -name '*.tsbuildinfo' -delete

RUN pnpm install --filter=api-server...
RUN pnpm install --filter=web...

RUN pnpm build:packages

RUN pnpm --filter=api-server exec pnpm build

RUN pnpm --filter=web exec pnpm build


# --- 2. Deps Stage: Create clean deployable output ---
FROM node:25-bullseye-slim AS deps

WORKDIR /app

RUN apt-get update && \
  apt-get install -y --no-install-recommends python3 make g++ && \
  npm install -g npm@latest pnpm && \
  rm -rf /var/lib/apt/lists/*

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api-server/package.json ./apps/api-server/
COPY packages/core/package.json ./packages/core/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/client/package.json ./packages/client/

# Install production dependencies
RUN pnpm install --prod --filter=api-server... && \
  apt-get purge -y python3 make g++ && \
  apt-get autoremove -y && \
  apt-get clean && \
  rm -rf /root/.npm /root/.pnpm-store /root/.cache /tmp/*

# Copy build output from builder
COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/apps/api-server/dist ./apps/api-server/dist

RUN pnpm deploy deploy/ --prod --filter=api-server --legacy

COPY ./apps/api-server/migrations/ ./deploy/dist/migrations/
COPY --from=builder /app/apps/web/out ./deploy/public


 # --- 3. Runner Stage: Minimal runtime image ---
FROM node:25-alpine AS runner

RUN apk add --no-cache wget tini && \
  npm install -g npm@11.7.0

ARG BUILD_ID
ARG BUILD_COMMIT
ARG APP_VERSION
ENV BUILD_ID=${BUILD_ID}
ENV BUILD_COMMIT=${BUILD_COMMIT}
ENV APP_VERSION=${APP_VERSION}
ENV NODE_ENV=production

WORKDIR /app

COPY --from=deps /app/deploy/ /app/

VOLUME ["/data"]

EXPOSE 3331

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -q --spider http://localhost:3331/api/v1/server/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
