import { createEnv } from "@t3-oss/env-core"
import z from "zod"

export const keys = () =>
  createEnv({
    server: {
      AUTOMATED_RESPONSE_CACHE_TTL_SECONDS: z.coerce
        .number()
        .default(24 * 60 * 60), // default 1 day
      AUTOMATED_RESPONSE_TTL_SECONDS: z.coerce.number().default(2), // default 2s
      AUTOMATED_RESPONSE_DELAY_SECONDS: z.coerce.number().default(2), // delay 2s
    },
    runtimeEnv: process.env,
  })

export const env = keys()
