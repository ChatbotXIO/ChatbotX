import { keys as realtimeKeys } from "@chatbotx.io/realtime-protocol/keys"
import { createEnv } from "@t3-oss/env-core"

export const env = createEnv({
  extends: [realtimeKeys()],
  server: {},
  runtimeEnv: process.env,
})
