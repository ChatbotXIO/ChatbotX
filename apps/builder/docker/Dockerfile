# syntax=docker/dockerfile:1
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
# BuildKit cache mount for the pnpm store (PNPM_HOME=/pnpm → store at /pnpm/store).
# Local to the build (and to BuildKit layer reuse) — deliberately NOT round-tripped
# through the GitHub Actions cache: exporting/importing the multi-GB store cost far
# more in CI than the ~40s install it was meant to save.
RUN --mount=type=cache,target=/pnpm/store \
  pnpm install --frozen-lockfile

COPY --from=pre /app/out/full/ .
# COPY --from=pre /app/.env .env

# Build-time placeholders. `next build` evaluates module-level code (better-auth
# is instantiated when route/instrumentation modules load), so without these the
# build logs a "Base URL could not be determined" warning and falls back to
# better-auth's insecure default secret. Build-only: the `release` stage is a
# fresh `FROM base`, so these never reach the runtime image — real values come
# from the container environment at runtime.
ENV BETTER_AUTH_SECRET="docker-build-time-placeholder-not-used-at-runtime-0"
ENV BETTER_AUTH_URL="http://localhost:3000"

# - `.next/cache` cache mount: Turbopack's filesystem cache, local to the build.
#   Not persisted across CI runs — `turbo.json` excludes `.next/cache/**` from the
#   build outputs, so restoring it can never turn a turbo cache miss into a hit;
#   it only ever warmed an already-executing build, at a much higher CI cost.
# - TURBO_* secret mounts: optional Turbo remote cache (self-hosted
#   turborepo-remote-cache or Vercel). When the secrets are not provided the
#   env vars stay unset and turbo builds without a remote cache — a full
#   remote-cache hit restores `.next/**` and skips `next build` entirely. This is
#   the only mechanism that can actually skip the build; wiring it up is a
#   secrets-only change.
RUN --mount=type=cache,target=/app/apps/builder/.next/cache \
  --mount=type=secret,id=TURBO_API,env=TURBO_API \
  --mount=type=secret,id=TURBO_TOKEN,env=TURBO_TOKEN \
  --mount=type=secret,id=TURBO_TEAM,env=TURBO_TEAM \
  SKIP_ENV_CHECK=true pnpm turbo run build --filter=builder

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
# `turbo prune` omits the repo-root tsconfig.base.json that packages/database's
# tsconfig extends; copy it back so esbuild resolves the `extends` instead of
# warning "Cannot find base config file ../../tsconfig.base.json".
COPY tsconfig.base.json ./tsconfig.base.json
RUN mkdir -p /app/seed-runner \
  && pnpm --filter "@chatbotx.io/database" exec esbuild src/seed/index.ts \
    --bundle --platform=node --format=cjs \
    --outfile=/app/seed-runner/seed.cjs \
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
# Default command passed to the entrypoint. `serve` runs env-gated migrate/seed
# then starts the server; override at run time with `migrate`, `seed`,
# `migrate-seed`, or any other command (e.g. `sh`) — see docker-entrypoint.sh.
CMD ["serve"]
EXPOSE 3000
