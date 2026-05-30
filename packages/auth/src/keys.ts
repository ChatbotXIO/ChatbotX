import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const keys = () =>
  createEnv({
    server: {
      NEXT_PUBLIC_BUILDER_URL: z.url(),
      BETTER_AUTH_SECRET: z.string(),
    },
    runtimeEnv: process.env,
  })

export const env = keys()
