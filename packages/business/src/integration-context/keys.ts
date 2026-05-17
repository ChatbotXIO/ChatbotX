import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const integrationContextEnv = () =>
  createEnv({
    server: {
      NEXT_PUBLIC_EDITION: z
        .enum(["community", "enterprise", "cloud"])
        .default("community"),
      NEXT_PUBLIC_BUILDER_URL: z.url().default("http://localhost:3123"),
      NEXT_PUBLIC_REALTIME_URL: z.url().default("http://localhost:1999"),
      NEXT_PUBLIC_ASSET_URL: z.url().default("http://localhost:3000"),
      REALTIME_BROADCAST_SECRET: z.string().min(1).default("secretkey"),
    },
    runtimeEnv: process.env,
    skipValidation: process.env.SKIP_ENV_CHECK === "true",
  })
