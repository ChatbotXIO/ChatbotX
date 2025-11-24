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
RUN apt update && \
  apt install -y supervisor tini redis && \
  apt-get autoremove -y && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=pre /app/out/json/ .
COPY --from=pre /app/.env .env
RUN pnpm install --frozen-lockfile

COPY --from=pre /app/out/full/ .
RUN pnpm turbo run db:client
RUN pnpm turbo run build --filter=worker

COPY --from=pre /app/apps/worker/docker/rootfs/ /
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["worker"]
