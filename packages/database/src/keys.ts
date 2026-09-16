import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const keys = () =>
  createEnv({
    server: {
      DATABASE_URL: z.url(),
      DATABASE_DEBUG: z.stringbool().optional().default(false),
      DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
      DATABASE_POOL_MIN: z.coerce.number().int().nonnegative().default(0),
      DATABASE_STATEMENT_TIMEOUT_MS: z.coerce
        .number()
        .int()
        .positive()
        .default(30_000),
      DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS: z.coerce
        .number()
        .int()
        .positive()
        .default(30_000),
      MESSAGE_SHARDS_PASSWORD: z.string().optional(),
      MESSAGE_SHARDS_SSL: z.stringbool().optional().default(false),
    },
    runtimeEnv: process.env,
    skipValidation: process.env.SKIP_ENV_CHECK === "true",
  })

export const env = keys()
