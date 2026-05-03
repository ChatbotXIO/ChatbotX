import { createEnv } from "@t3-oss/env-nextjs"
import z from "zod"

export const keys = () =>
  createEnv({
    server: {
      REALTIME_API_KEY: z.string().min(1),
      REALTIME_AUTH_URL: z.url().optional(),
    },
    client: {
      NEXT_PUBLIC_REALTIME_URL: z.url(),
    },
    experimental__runtimeEnv: {
      NEXT_PUBLIC_REALTIME_URL: process.env.NEXT_PUBLIC_REALTIME_URL,
    },
  })
