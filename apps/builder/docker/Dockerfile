FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS pre

# Install pnpm
RUN npm install -g turbo@^2

# Generate a partial monorepo for a target package
WORKDIR /app
COPY . .
RUN turbo prune builder --docker

FROM base AS deps

ENV NODE_OPTIONS="--max-old-space-size=4096"

RUN apk update
RUN apk add --no-cache libc6-compat

WORKDIR /app
RUN npm install -g pnpm@^10

COPY --from=pre /app/out/json/ .
RUN pnpm install --frozen-lockfile

COPY --from=pre /app/out/full/ .
COPY --from=pre /app/.env .env

RUN pnpm turbo run db:client
RUN pnpm turbo run build --filter=builder

FROM base AS builder

COPY apps/builder/docker/rootfs/ /
WORKDIR /app

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

USER nextjs

# # Automatically leverage output traces to reduce image size
# # https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=deps /app/packages/database ./packages/database
COPY --from=deps --chown=nextjs:nodejs /app/apps/builder/.next/standalone ./
COPY --from=deps --chown=nextjs:nodejs /app/apps/builder/.next/static ./apps/builder/.next/static
COPY --from=deps --chown=nextjs:nodejs /app/apps/builder/.next/cache ./apps/builder/.next/cache
COPY --from=deps --chown=nextjs:nodejs /app/apps/builder/public ./apps/builder/public

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
EXPOSE 3000
