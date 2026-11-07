FROM node:26.13.0-trixie-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV pnpm_config_store_dir="/pnpm/store"
COPY --from=ghcr.io/pnpm/pnpm:12.16.1 /opt/pnpm /opt/pnpm
RUN for bin in pnpm pn pnpx pnx; do ln -s "/opt/pnpm/$bin" "/usr/local/bin/$bin"; done

WORKDIR /app

# Install dependencies only when needed
FROM base AS pre
RUN npm install -g turbo@^2

# Generate a partial monorepo for a target package
COPY . .
RUN turbo prune realtime --docker

FROM base AS deps
ENV NODE_OPTIONS="--max-old-space-size=4096"

RUN apt-get update && apt-get install -y ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY apps/realtime/docker/rootfs/ /

COPY --from=pre /app/out/json/ .
RUN pnpm install --frozen-lockfile

COPY --from=pre /app/out/full/ .
# COPY --from=pre /app/.env .env

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
EXPOSE 1999
