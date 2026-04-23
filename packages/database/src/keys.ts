import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const keys = () =>
  createEnv({
    server: {
      NODE_ENV: z.string().optional().default("development"),
      DATABASE_URL: z.url(),
      PRISMA_DEBUG: z.coerce.boolean().optional().default(false),
    },
    clientPrefix: "NEXT_PUBLIC_",
    client: {
      NEXT_PUBLIC_ASSET_URL: z.url(),
    },
    runtimeEnv: process.env,
    skipValidation: process.env.SKIP_ENV_CHECK === "true",
  })

export const env = keys()
