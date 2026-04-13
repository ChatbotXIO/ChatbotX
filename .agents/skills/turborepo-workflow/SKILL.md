---
name: turborepo-workflow
description: >-
  Manage turborepo monorepo development workflow including dev servers, builds,
  linting, and package management. Use when running dev, build, lint, deploy,
  or managing workspace packages in this pnpm + turbo monorepo.
---

# Turborepo Workflow

## Project Overview

Monorepo managed by **pnpm workspaces + Turborepo**. Node >= 24, TypeScript 6.x.

### Workspace Layout

```
apps/
  builder/     → Next.js 16 web UI (port 3123)
  worker/      → Background workers (BullMQ, Kafka)
  cli/         → CLI tool (yargs)
  mcp-server/  → MCP server
  partysocket/ → PartyKit realtime

packages/
  database/    → Drizzle ORM + PostgreSQL
  ui/          → Shared UI (Tailwind 4, Radix, Dice UI)
  utils/       → Shared utilities
  redis/       → Redis/Dragonfly client
  kafka/       → Kafka client
  clickhouse/  → ClickHouse analytics
  analytics/   → Analytics services
  worker-config/ → BullMQ queues, job types
  sdk/         → Types, integration contracts
  ai/          → AI model/provider config
  events/      → Domain events
  flow-config/ → Flow step definitions
  mail/        → Email templates
  public-apis/ → Public API surface
  ...

integrations/
  messenger/   → Facebook Messenger
  whatsapp/    → WhatsApp Business
  zalo/        → Zalo OA
  webchat/     → In-app webchat
  chatbotx/    → Internal chatbot
  google-sheets/ → Google Sheets
  openai/      → OpenAI integration
```

## Common Commands

### Development

```bash
# Start all apps in dev mode
pnpm dev

# Start specific app
pnpm --filter builder dev
pnpm --filter worker dev

# Start with HTTPS
pnpm --filter builder https
```

### Build & Lint

```bash
# Build all packages (respects turbo dependency graph)
pnpm build

# Lint (uses Biome via Ultracite)
pnpm lint
pnpm fix          # auto-fix

# Type checking
pnpm --filter builder check-types
```

### Database

```bash
# Full setup (migrate + seed)
pnpm --filter database db:setup

# Migration only
pnpm --filter database db:migrate

# Create new migration
pnpm --filter database make:migration <name>

# Studio (GUI)
pnpm --filter database db:studio
```

### Code Quality

```bash
# Check circular dependencies
pnpm check:circular

# Check unused exports (knip)
pnpm check:unused
```

## Package Management

- Use `pnpm add <pkg> --filter <workspace>` to add dependencies to specific workspace
- Workspace packages use `@chatbotx.io/*` scope
- Cross-workspace imports: `@chatbotx.io/database/client`, `@chatbotx.io/ui/button`, etc.
- Package exports are defined in each `package.json` `exports` field

### Adding a New Workspace Package

When creating a new package (e.g. `integrations/<channel>/`):

1. Create `package.json` with `"name": "@chatbotx.io/<name>"`
2. Add `"@chatbotx.io/<name>": "workspace:*"` to consumer `package.json` dependencies
3. Run `CI=true pnpm install --no-frozen-lockfile` to link the package
   - **MUST** use `CI=true` to avoid TTY confirmation prompt in non-interactive shells
   - Without this step, imports of the new package will fail with `Cannot find module`

## Turbo Pipeline

Defined in `turbo.json`:
- `build` depends on `^build` (builds dependencies first), outputs `.next/**`, `dist/**`
- `dev`, `https`, `packages:dev` are persistent (long-running)
- `db:migrate`, `db:setup`, `db:reset`, `db:studio` are non-cached

## Environment

- Root `.env` file is loaded by apps via `dotenv -e ../../.env`
- Env validation uses `@t3-oss/env-core` + Zod in `keys.ts` files
- `SKIP_ENV_CHECK=true` to bypass validation during build

## Git Hooks

- **lefthook** manages pre-commit hooks (see `lefthook.yml`)
