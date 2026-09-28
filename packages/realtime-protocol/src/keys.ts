import { createEnv } from "@t3-oss/env-core"
import z from "zod"

export const keys = () =>
  createEnv({
    server: {
      REALTIME_BROADCAST_SECRET: z.string().min(32),
      // Builder base URL used by the presence-report client.
      NEXT_PUBLIC_BUILDER_URL: z.url().default("http://localhost:3123"),
    },
    runtimeEnv: process.env,
    skipValidation: process.env.SKIP_ENV_CHECK === "true",
  })

export const env = keys()
