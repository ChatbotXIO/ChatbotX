import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

export const keys = () =>
  createEnv({
    server: {
      REDIS_URL: z.url(),
      NEXT_PHASE: z.string().default(""),
    },
    experimental__runtimeEnv: {},
  })
