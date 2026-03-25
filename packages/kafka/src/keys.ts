import { createEnv } from "@t3-oss/env-core"
import { kafkaEnvSchema } from "./schema"

export const keys = () =>
  createEnv({
    server: kafkaEnvSchema.shape,
    runtimeEnv: process.env,
  })
