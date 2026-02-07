# --- 1. Builder Stage: Build source files ---
FROM node:25.6-bullseye-slim AS builder

WORKDIR /app

RUN apt-get update && \
  apt-get install -y --no-install-recommends python3 make g++ && \
  npm install -g npm@11.7.0 pnpm && \
  rm -rf /var/lib/apt/lists/*

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY --parents apps/*/package.json ./
COPY --parents apps/web/scripts/ ./
COPY --parents packages/*/package.json ./

RUN pnpm install --filter=api-server... && \
    pnpm install --filter=web...

COPY packages/ ./packages/
COPY apps/api-server/ ./apps/api-server/
COPY apps/web/ ./apps/web/
COPY tsconfig*.json ./

ARG APP_VERSION
ARG BUILD_COMMIT
ARG BUILD_ID

ENV NEXT_PUBLIC_APP_VERSION=${APP_VERSION} \
    NEXT_PUBLIC_BUILD_COMMIT=${BUILD_COMMIT} \
    NEXT_PUBLIC_BUILD_ID=${BUILD_ID}

RUN find . -name '*.tsbuildinfo' -delete && \
    pnpm build:packages && \
    pnpm --filter=api-server exec pnpm build && \
    pnpm --filter=web exec pnpm build:prod


# --- 2. Deps Stage: Create clean deployable output ---
FROM node:25.6-bullseye-slim AS deps

WORKDIR /app

RUN apt-get update && \
  apt-get install -y --no-install-recommends python3 make g++ && \
  npm install -g npm@11.7.0 pnpm && \
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

# Remove unnecessary files from node_modules to reduce image size
RUN cd deploy && \
    find node_modules -type f \( -name '*.md' -o -name 'LICENSE*' -o -name 'CHANGELOG*' -o -name 'README*' \) -delete && \
    find node_modules -type d \( -name '__tests__' -o -name 'test' -o -name 'tests' -o -name 'docs' -o -name 'examples' \) -exec rm -rf {} + 2>/dev/null || true

COPY ./apps/api-server/migrations/ ./deploy/dist/migrations/
COPY --from=builder /app/apps/web/out ./deploy/public


# --- 3. Hardened Runner Stage: Security-hardened production image ---
FROM dhi.io/node:25.6 AS runner-hardened

ARG BUILD_ID
ARG BUILD_COMMIT
ARG APP_VERSION

ENV BUILD_ID=${BUILD_ID} \
    BUILD_COMMIT=${BUILD_COMMIT} \
    APP_VERSION=${APP_VERSION} \
    NODE_ENV=production

WORKDIR /app

# Copy with read-only permissions (hardened images enforce read-only filesystem)
COPY --from=deps --chmod=555 /app/deploy/ /app/

# Run as non-root user (UID 65532 = "nobody" user, exists everywhere)
# Users can override with: docker run --user $(id -u):$(id -g)
USER 65532:65532

VOLUME ["/data"]

EXPOSE 3331

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3331/api/v1/server/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]


CMD ["node", "dist/main.js"]


# --- 4. Runner Stage: Minimal production image (DEFAULT) ---
FROM node:25.6-bullseye-slim AS runner

RUN apt-get update && \
    apt-get install -y --no-install-recommends tini && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* \
           /usr/local/lib/node_modules/npm \
           /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm \
           /usr/local/bin/npx \
           /usr/local/bin/yarn \
           /usr/local/bin/yarnpkg \
           /usr/local/bin/corepack

ARG BUILD_ID
ARG BUILD_COMMIT
ARG APP_VERSION

ENV BUILD_ID=${BUILD_ID} \
    BUILD_COMMIT=${BUILD_COMMIT} \
    APP_VERSION=${APP_VERSION} \
    NODE_ENV=production

WORKDIR /app

COPY --from=deps --chmod=555 /app/deploy/ /app/

# Run as non-root user (UID 65532 = "nobody" user, exists everywhere)
# Users can override with: docker run --user $(id -u):$(id -g)
USER 65532:65532

VOLUME ["/data"]

EXPOSE 3331

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3331/api/v1/server/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# Use tini as PID 1 for proper signal handling and zombie reaping
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
