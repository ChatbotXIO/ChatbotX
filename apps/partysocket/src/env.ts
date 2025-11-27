import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

export const env = createEnv({
  client: {
    NEXT_PUBLIC_PARTYSOCKET_URL: z.url(),
    NEXT_PUBLIC_PARTYSOCKET_AUTH_URL: z.url().optional(),
  },
  runtimeEnv: {
    NEXT_PUBLIC_PARTYSOCKET_URL: process.env.NEXT_PUBLIC_PARTYSOCKET_URL,
    NEXT_PUBLIC_PARTYSOCKET_AUTH_URL:
      process.env.NEXT_PUBLIC_PARTYSOCKET_AUTH_URL,
  },
})
