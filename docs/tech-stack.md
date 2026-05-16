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

### Database

- [Drizzle ORM](https://orm.drizzle.team/) + **PostgreSQL** (with **pgvector** for vector search)
- Package: `packages/database` (`@chatbotx.io/database`)

### Authentication

- [Better Auth](https://better-auth.com/)

### Background Jobs & Queues

- [BullMQ](https://bullmq.io/) backed by **Redis / Dragonfly**
- **Kafka** for high-throughput sequence dispatch
- Package: `packages/worker-config` (`@chatbotx.io/worker-config`)

### Realtime

- Custom realtime server at `apps/realtime` (port 1999)

### Storage

- S3-compatible object storage (RustFS locally via Docker)

### Utilities

- [nuqs](https://nuqs.47ng.com/) — URL search param state management
- [@t3-oss/env-core](https://env.t3.gg/) — typed env validation
- Lint/format: **Ultracite** (Biome)
- Git hooks: **lefthook**
