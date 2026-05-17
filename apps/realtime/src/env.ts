import { keys as partysocketKeys } from "@chatbotx.io/partysocket-config/keys"
import { createEnv } from "@t3-oss/env-core"

export const env = createEnv({
  extends: [partysocketKeys()],
  server: {},
  runtimeEnv: process.env,
})
