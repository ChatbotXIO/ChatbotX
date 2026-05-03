import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

export const env = createEnv({
  server: {
    REALTIME_AUTH_URL: z.url().optional(),
  },
  client: {
    NEXT_PUBLIC_REALTIME_URL: z.url(),
  },
  runtimeEnv: {
    REALTIME_AUTH_URL: process.env.REALTIME_AUTH_URL,
    NEXT_PUBLIC_REALTIME_URL: process.env.NEXT_PUBLIC_REALTIME_URL,
  },
})
