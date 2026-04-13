import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const keys = () =>
  createEnv({
    server: {
      ANALYTICS_ENABLED: z
        .enum(["true", "false"])
        .default("false")
        .transform((v) => v === "true"),
    },
    clientPrefix: "CHATBOTX_PUBLIC_",
    client: {},
    runtimeEnv: process.env,
  })

export const env = keys()
