FROM node:26.13.0-trixie-slim AS base

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
RUN turbo prune chatbotx-mcp --docker

FROM base AS deps
ENV NODE_OPTIONS="--max-old-space-size=4096"

WORKDIR /app
COPY --from=pre /app/out/json/ .
# COPY --from=pre /app/.env .env
RUN pnpm install --frozen-lockfile

COPY --from=pre /app/out/full/ .
# `turbo prune` omits the repo-root tsconfig.base.json that apps/mcp-server's
# tsconfig extends; copy it back so tsdown's dts plugin can resolve `extends`
# instead of failing with "File '../../tsconfig.base.json' not found".
COPY tsconfig.base.json ./tsconfig.base.json
RUN pnpm turbo run build --filter=chatbotx-mcp

FROM base AS release
RUN apt update && \
  apt install -y supervisor tini && \
  apt-get autoremove -y && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*
COPY apps/mcp-server/docker/rootfs/ /

COPY --from=deps /app/apps/mcp-server/dist /app/apps/mcp-server/dist
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
EXPOSE 3333
