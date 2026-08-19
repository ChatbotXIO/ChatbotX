FROM node:26-trixie-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

FROM base AS pre
RUN npm install -g turbo@^2

WORKDIR /app
COPY . .
RUN turbo prune javascript-executor --docker

FROM base AS deps
ENV NODE_OPTIONS="--max-old-space-size=4096"

RUN apt-get update && \
  apt-get install -y --no-install-recommends g++ make python3 && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=pre /app/out/json/ .
RUN pnpm install --frozen-lockfile

COPY --from=pre /app/out/full/ .
RUN SKIP_ENV_CHECK=true pnpm turbo run build --filter=javascript-executor

FROM base AS release
RUN apt-get update && \
  apt-get install -y --no-install-recommends curl tini && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*
COPY apps/javascript-executor/docker/rootfs/ /

COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/apps/javascript-executor/node_modules /app/apps/javascript-executor/node_modules
COPY --from=deps /app/apps/javascript-executor/dist /app/apps/javascript-executor/dist
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER node
ENTRYPOINT ["tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
STOPSIGNAL SIGTERM
EXPOSE 3210
