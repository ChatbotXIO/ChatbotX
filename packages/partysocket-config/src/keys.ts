import { createEnv } from "@t3-oss/env-nextjs"
import z from "zod"

export const keys = () =>
  createEnv({
    server: {
      PARTYSOCKET_API_KEY: z.string().min(1),
    },
    client: {
      NEXT_PUBLIC_PARTYSOCKET_URL: z.url(),
    },
    experimental__runtimeEnv: {
      NEXT_PUBLIC_PARTYSOCKET_URL: process.env.NEXT_PUBLIC_PARTYSOCKET_URL,
    },
  })
