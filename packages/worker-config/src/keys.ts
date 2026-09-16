import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

export const keys = () =>
  createEnv({
    server: {
      REDIS_URL: z.url(),
      NEXT_PHASE: z.string().default(""),
      CHAT_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(20),
      CHAT_WORKER_RATE_LIMIT_MAX: z.coerce
        .number()
        .int()
        .positive()
        .default(80),
      CHAT_WORKER_RATE_LIMIT_DURATION_MS: z.coerce
        .number()
        .int()
        .positive()
        .default(1000),
    },
    experimental__runtimeEnv: {},
    skipValidation: process.env.SKIP_ENV_CHECK === "true",
  })
