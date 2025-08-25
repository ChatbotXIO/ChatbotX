FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS pre

# Install pnpm
RUN npm install -g turbo@^2

# Generate a partial monorepo for a target package
WORKDIR /app
COPY . .
RUN turbo prune worker --docker

FROM base AS deps

ENV NODE_OPTIONS="--max-old-space-size=4096"

RUN apk add --upgrade --no-cache libc6-compat supervisor tini redis

WORKDIR /app
RUN npm install -g pnpm@^10

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
