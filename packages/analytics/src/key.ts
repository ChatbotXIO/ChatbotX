import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const keys = () =>
  createEnv({
    server: {
      ANALYTICS_ENABLED: z.coerce.boolean().default(false),
    },
    runtimeEnv: process.env,
  })

export const env = keys()
