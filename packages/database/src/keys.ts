import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const keys = () =>
  createEnv({
    server: {
      NODE_ENV: z.string().optional().default("development"),
      DATABASE_URL: z.url(),
      DATABASE_READ_URL: z.url().optional(),
      PRISMA_DEBUG: z.coerce.boolean().optional().default(false),
    },
    clientPrefix: "NEXT_PUBLIC_",
    client: {
      NEXT_PUBLIC_ASSET_URL: z.url(),
    },
    runtimeEnv: {
      NEXT_PUBLIC_ASSET_URL: process.env.NEXT_PUBLIC_ASSET_URL,
      DATABASE_URL: process.env.DATABASE_URL,
      DATABASE_READ_URL: process.env.DATABASE_READ_URL,
    },
    skipValidation: process.env.SKIP_ENV_CHECK === "true",
  })

export const env = keys()
