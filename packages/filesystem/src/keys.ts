import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

export const keys = () =>
  createEnv({
    server: {
      S3_ENDPOINT: z.url().optional(),
      S3_ACCESS_KEY_ID: z.string().min(1).optional(),
      S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
      S3_REGION: z.string().min(1),
      S3_BUCKET: z.string().min(1),
    },
    experimental__runtimeEnv: {},
  })
