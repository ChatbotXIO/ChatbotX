FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies
COPY pnpm-lock.yaml ./
COPY package.json ./
COPY pnpm-workspace.yaml ./
COPY packages/*/package.json ./packages/

RUN pnpm install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
RUN pnpm --filter partysocket build

# Production image, copy all the files and run the app
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=1999

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 partysocket

# Copy necessary files
COPY --from=builder /app/apps/partysocket/dist ./dist
COPY --from=builder /app/apps/partysocket/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

# Set ownership
RUN chown -R partysocket:nodejs /app

USER partysocket

EXPOSE 1999

CMD ["node", "dist/index.js"]
