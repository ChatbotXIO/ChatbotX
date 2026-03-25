import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const keys = () =>
  createEnv({
    server: {
      REDIS_URL: z.url(),
      REDIS_CACHE_URL: z.url().optional(),
      REDIS_QUEUE_URL: z.url().optional(),
      REDIS_SEQUENCE_URL: z.url().optional(),
    },
    runtimeEnv: process.env,
  })
