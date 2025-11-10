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
RUN apt update && apt install redis-server -y

WORKDIR /app
COPY --from=pre /app/out/json/ .
RUN pnpm install --frozen-lockfile

COPY --from=pre /app/out/full/ .
COPY --from=pre /app/.env .env

RUN pnpm turbo run db:client
RUN pnpm turbo run build --filter=builder

# Build the application
FROM base AS release
COPY apps/builder/docker/rootfs/ /


# # Don't run production as root
# RUN addgroup --system --gid 1001 nodejs
# RUN adduser --system --uid 1001 nextjs
# USER nextjs

# # Automatically leverage output traces to reduce image size
# # https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/database /app/packages/database
COPY --from=deps --chown=nextjs:nodejs /app/apps/builder/.next/standalone ./
COPY --from=deps --chown=nextjs:nodejs /app/apps/builder/.next/static ./apps/builder/.next/static
# COPY --from=deps --chown=nextjs:nodejs /app/apps/builder/.next/cache ./apps/builder/.next/cache
COPY --from=deps --chown=nextjs:nodejs /app/apps/builder/public ./apps/builder/public

# RUN ./node_modules/.bin/prisma generate --schema=packages/prisma/postgresql/schema.prisma;
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
EXPOSE 3000
