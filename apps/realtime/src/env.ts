import { keys as partysocketKeys } from "@chatbotx.io/partysocket-config/keys"
import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const env = createEnv({
  extends: [partysocketKeys()],
  server: {
    NEXT_PUBLIC_BUILDER_URL: z.url().default("http://localhost:3123"),
  },
  runtimeEnv: process.env,
})
