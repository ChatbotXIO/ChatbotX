import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const quotaEnforcementEnv = () =>
  createEnv({
    server: {
      QUOTA_MAC_ADMISSION: z.enum(["reserve", "lock"]).default("reserve"),
    },
    runtimeEnv: process.env,
    skipValidation: process.env.SKIP_ENV_CHECK === "true",
  })
