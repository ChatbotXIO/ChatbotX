import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

export const keys = () =>
  createEnv({
    server: {
      AWS_URL: z.url().optional(),
      AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
      AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),
      AWS_REGION: z.string().min(1),
      AWS_BUCKET: z.string().min(1),
    },
    experimental__runtimeEnv: {},
  })
