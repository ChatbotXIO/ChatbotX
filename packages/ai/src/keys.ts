import { createEnv } from "@t3-oss/env-core"
import z from "zod"

export const keys = () =>
  createEnv({
    server: {
      AI_INTEGRATION_CACHE_TTL_SECONDS: z.coerce.number().default(60 * 60), // default 1 hour
    },
    runtimeEnv: process.env,
    emptyStringAsUndefined: true,
  })

export const env = keys()
