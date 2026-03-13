import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const env = createEnv({
  server: {
    CHATBOTX_API_KEY: z.string().optional(),
    CHATBOTX_API_URL: z.url().optional(),
    CHATBOTX_ALLOW_SELF_SIGNED_CERT: z.enum(["true", "false"]).optional(),
  },
  runtimeEnv: process.env,
})
