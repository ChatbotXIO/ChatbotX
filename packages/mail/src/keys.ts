import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

export const keys = () =>
  createEnv({
    server: {
      SMTP_SERVER: z.string().min(1),
    },
    client: {
      NEXT_PUBLIC_SMTP_FROM: z.string().min(1),
    },
    experimental__runtimeEnv: {
      NEXT_PUBLIC_SMTP_FROM: process.env.NEXT_PUBLIC_SMTP_FROM,
    },
  })
