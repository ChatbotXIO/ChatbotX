import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const keys = () =>
  createEnv({
    server: {
      NODE_ENV: z.string().optional().default("development"),
      DATABASE_URL: z.url(),
      PRISMA_DEBUG: z.coerce.boolean().optional().default(false),
      ENABLE_MESSAGE_SHARDING: z.coerce.string().optional().default("false"),
      MESSAGE_SHARDS_PASSWORD: z.string().optional(),
      MESSAGE_SHARDS_SSL: z.coerce.boolean().optional().default(false),
    },
    clientPrefix: "NEXT_PUBLIC_",
    client: {
      NEXT_PUBLIC_ASSET_URL: z.url(),
    },
    runtimeEnv: {
      NEXT_PUBLIC_ASSET_URL: process.env.NEXT_PUBLIC_ASSET_URL,
      DATABASE_URL: process.env.DATABASE_URL,
      ENABLE_MESSAGE_SHARDING: process.env.ENABLE_MESSAGE_SHARDING,
      MESSAGE_SHARDS_PASSWORD: process.env.MESSAGE_SHARDS_PASSWORD,
      MESSAGE_SHARDS_SSL: process.env.MESSAGE_SHARDS_SSL,
    },
    skipValidation: process.env.SKIP_ENV_CHECK === "true",
  })

export const env = keys()
