# Tech Stack

Key components of the project's tech stack.

### Core Technologies

- [Next.js](https://nextjs.org/docs) 16 (App Router)
- [React](https://react.dev/) 19
- [TypeScript](https://www.typescriptlang.org/) 5

### UI Libraries

- [Shadcn UI](https://ui.shadcn.com/) + [Radix UI](https://www.radix-ui.com/)
- [Tailwind CSS](https://tailwindcss.com/) v4
- [Sonner](https://sonner.emilkowal.ski/) (toasts)
- [TanStack Table](https://tanstack.com/table)
- [DnD Kit](https://dndkit.com/)

### Forms and Validation

- [React Hook Form](https://react-hook-form.com/)
- [Zod](https://zod.dev/) (schema validation)
- [next-safe-action](https://next-safe-action.dev/) (server actions with type safety)

### API Layer

- [oRPC](https://orpc.unnoq.com/) — RPC + OpenAPI, serves `/rpc` and `/api` endpoints
- [TanStack Query](https://tanstack.com/query) + [`@orpc/tanstack-query`](https://orpc.unnoq.com/docs/integrations/tanstack-query) — client-side cache for oRPC list/detail reads; zustand is reserved for client-only state

### Database

- [Drizzle ORM](https://orm.drizzle.team/) + **PostgreSQL** (with **pgvector** for vector search)
- Package: `packages/database` (`@chatbotx.io/database`)

### Authentication

- [Better Auth](https://better-auth.com/)

### Background Jobs & Queues

- [BullMQ](https://bullmq.io/) backed by **Redis / Dragonfly**
- Queues split into a hot group (`integration`, `chat`, `notification`, `low`,
  `callTranscription`, `whatsappVoipSignaling`) and a bulk group (`aiAgent`, `heavy`,
  `default`, `schedule`, `trigger`, `webhook`, `quota`) via `REDIS_QUEUE_URL` /
  `REDIS_QUEUE_BULK_URL` — each falls back to `REDIS_URL` if unset
- Sequence scheduling uses BullMQ over Redis across 256 hash buckets with Redlock coordination
- The cache/lock role requires bloom-filter commands (`BF.RESERVE`/`BF.ADD` for MAC
  counting) — Dragonfly, `redis:8`, or Valkey with `valkey-bloom`, never plain Valkey
- Push notifications via the **Expo Push Service** (`notification` queue/worker)
- Package: `packages/worker-config` (`@chatbotx.io/worker-config`)
- See `docs/adr/0004-messaging-substrate-scaling-path.md` and
  `docs/scaling-messaging.md` for the substrate matrix and scaling triggers

### Realtime

- Custom realtime server at `apps/realtime` (port 1999)

### Storage

- S3-compatible object storage (RustFS locally via Docker)

### Utilities

- [nuqs](https://nuqs.47ng.com/) — URL search param state management
- [@t3-oss/env-core](https://env.t3.gg/) — typed env validation
- Lint/format: **Ultracite** (Biome)
- Git hooks: **lefthook**
