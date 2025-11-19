import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

export const keys = () =>
  createEnv({
    server: {
      NODE_ENV: z.string().optional().default("development"),
      DATABASE_URL: z.url(),
      PRISMA_DEBUG: z.coerce.boolean().optional().default(false),
      ENABLE_PGVECTOR_EXTENSION: z.coerce.boolean().optional().default(false),
    },
    client: {
      NEXT_PUBLIC_ASSET_URL: z.url(),
    },
    experimental__runtimeEnv: {
      NEXT_PUBLIC_ASSET_URL: process.env.NEXT_PUBLIC_ASSET_URL,
    },
  })
