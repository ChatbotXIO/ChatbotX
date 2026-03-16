import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const env = createEnv({
  server: {
    CHATBOTX_API_KEY: z.string().min(1, "Missing API_KEY"),
    CHATBOTX_API_URL: z.url().default("https://api.chatbotx.io"),
    CHATBOTX_ALLOW_SELF_SIGNED_CERT: z.enum(["true", "false"]).optional(),
  },
  runtimeEnv: process.env,
})
