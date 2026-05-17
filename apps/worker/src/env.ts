import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

const environmentRule = z.enum(["dev", "prod"]).default("dev")
const editionRule = z
  .enum(["community", "enterprise", "cloud"])
  .default("community")

export const env = createEnv({
  server: {
    NEXT_PUBLIC_ENVIRONMENT: environmentRule,
    NEXT_PUBLIC_EDITION: editionRule,
    NEXT_PUBLIC_BUILDER_URL: z.url(),
    NEXT_PUBLIC_REALTIME_URL: z.url(),
  },
  runtimeEnv: process.env,
  skipValidation: process.env.SKIP_ENV_CHECK === "true",
})
