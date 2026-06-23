import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const keys = () =>
  createEnv({
    server: {
      DATABASE_URL: z.url(),
      DATABASE_DEBUG: z.stringbool().optional().default(false),
      MESSAGE_SHARDS_PASSWORD: z.string().optional(),
      MESSAGE_SHARDS_SSL: z.stringbool().optional().default(false),
    },
    runtimeEnv: process.env,
    skipValidation: process.env.SKIP_ENV_CHECK === "true",
  })

export const env = keys()
