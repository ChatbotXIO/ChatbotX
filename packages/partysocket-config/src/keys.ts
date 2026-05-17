import { createEnv } from "@t3-oss/env-core"
import z from "zod"

export const keys = () =>
  createEnv({
    server: {
      REALTIME_BROADCAST_SECRET: z.string().min(1).default("secretkey"),
      REALTIME_SESSION_VERIFY_URL: z.url().optional(),
    },
    client: {
      NEXT_PUBLIC_REALTIME_URL: z.url(),
    },
    clientPrefix: "NEXT_PUBLIC_",
    runtimeEnv: {
      NEXT_PUBLIC_REALTIME_URL: process.env.NEXT_PUBLIC_REALTIME_URL,
    },
    skipValidation: process.env.SKIP_ENV_CHECK === "true",
  })

export const env = keys()
