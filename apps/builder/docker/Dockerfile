FROM node:24-trixie-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Install dependencies only when needed
FROM base AS pre
RUN npm install -g turbo@^2

WORKDIR /app
COPY . .
RUN turbo prune builder --docker

# Install dependencies
FROM base AS deps
ENV NODE_OPTIONS="--max-old-space-size=4096"

WORKDIR /app
COPY --from=pre /app/out/json/ .
RUN pnpm install --frozen-lockfile

COPY --from=pre /app/out/full/ .
# COPY --from=pre /app/.env .env

RUN SKIP_ENV_CHECK=true pnpm turbo run build --filter=builder

# Standalone image has no pnpm workspace; bundle a tiny migration runner (drizzle-orm + pg only).
RUN apt-get update && apt-get install -y --no-install-recommends jq \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/migrate-runner
COPY packages/database/package.json database-package.json
COPY packages/database/scripts scripts
COPY packages/database/drizzle drizzle
RUN bash /app/migrate-runner/scripts/create-runner-package.sh migrate ./database-package.json > package.json \
  && npm install --omit=dev --ignore-scripts

# Bundled seed (workspace TS → single ESM file; `pg` stays external — installed below).
WORKDIR /app
RUN mkdir -p /app/seed-runner \
  && pnpm --filter "@chatbotx.io/database" exec esbuild src/seed/index.ts \
    --bundle --platform=node --format=esm \
    --outfile=/app/seed-runner/seed.mjs \
    --external:pg

WORKDIR /app/seed-runner
RUN bash /app/migrate-runner/scripts/create-runner-package.sh seed /app/migrate-runner/database-package.json > package.json \
  && npm install --omit=dev --ignore-scripts

WORKDIR /app

# Build the application
FROM base AS release

COPY apps/builder/docker/rootfs/ /

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=deps /app/packages/database /app/packages/database
COPY --from=deps --chown=nextjs:nodejs /app/apps/builder/.next/standalone ./
COPY --from=deps --chown=nextjs:nodejs /app/apps/builder/.next/static ./apps/builder/.next/static
COPY --from=deps --chown=nextjs:nodejs /app/apps/builder/public ./apps/builder/public
COPY --from=deps --chown=nextjs:nodejs /app/migrate-runner ./migrate-runner
COPY --from=deps --chown=nextjs:nodejs /app/seed-runner ./seed-runner

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
EXPOSE 3000
