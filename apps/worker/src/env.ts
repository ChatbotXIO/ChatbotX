import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

const editionRule = z
  .enum(["community", "enterprise", "cloud"])
  .default("community")

export const env = createEnv({
  server: {
    NEXT_PUBLIC_EDITION: editionRule,
    QUOTA_SYNC_INTERVAL_SECONDS: z.coerce.number().int().min(10).default(60),
    // Observability — all optional; omitting SENTRY_DSN disables Sentry.
    // Read directly from process.env in instrument.ts (runs before this module).
    SENTRY_DSN: z.url().optional(),
    SENTRY_ENVIRONMENT: z.string().optional(),
    SENTRY_RELEASE: z.string().optional(),
    SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional(),
    WORKER_NAME: z.string().optional(),
  },
  runtimeEnv: process.env,
  skipValidation: process.env.SKIP_ENV_CHECK === "true",
})
