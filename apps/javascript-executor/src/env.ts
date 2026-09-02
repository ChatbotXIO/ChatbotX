import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const env = createEnv({
  server: {
    JAVASCRIPT_EXECUTOR_TOKEN: z.string().min(32),
    PORT: z.coerce.number().int().positive().default(3210),
    HOST: z.string().default("0.0.0.0"),
    MAX_CONCURRENCY: z.coerce.number().int().positive().default(8),
  },
  runtimeEnv: process.env,
  skipValidation: process.env.SKIP_ENV_CHECK === "true",
})
