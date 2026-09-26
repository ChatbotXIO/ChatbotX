FROM node:24-trixie-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Install dependencies only when needed
FROM base AS pre
RUN npm install -g turbo@^2

# Generate a partial monorepo for a target package
WORKDIR /app
COPY . .
RUN turbo prune worker --docker

FROM base AS deps
ENV NODE_OPTIONS="--max-old-space-size=4096"

WORKDIR /app
COPY --from=pre /app/out/json/ .
# COPY --from=pre /app/.env .env
RUN pnpm install --frozen-lockfile

COPY --from=pre /app/out/full/ .
RUN SKIP_ENV_CHECK=true pnpm turbo run build --filter=worker
# The entrypoint runs with `--enable-source-maps`; full maps cost +511MB heap,
# first-party-only maps +114MB. `turbo prune` omits root scripts; copy it back.
COPY scripts/prune-sourcemaps.mjs scripts/prune-sourcemaps.mjs
RUN node scripts/prune-sourcemaps.mjs apps/worker/dist

FROM base AS release
RUN apt update && \
  apt install -y tini redis && \
  apt-get autoremove -y && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*
COPY apps/worker/docker/rootfs/ /

COPY --from=deps /app/apps/worker/dist /app/apps/worker/dist
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
STOPSIGNAL SIGTERM
# Core queues + schedule in one process (~500MB). Use `worker all` for one
# process per worker, or `worker <name>` to run a single queue per container.
CMD ["worker", "standalone"]
