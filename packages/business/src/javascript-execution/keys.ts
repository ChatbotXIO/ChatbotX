import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const javascriptExecutionEnv = () =>
  createEnv({
    server: {
      JAVASCRIPT_EXECUTOR_URL: z.url(),
      JAVASCRIPT_EXECUTOR_TOKEN: z.string().min(32),
    },
    runtimeEnv: process.env,
    skipValidation: process.env.SKIP_ENV_CHECK === "true",
  })
