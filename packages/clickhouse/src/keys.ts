import { createEnv } from "@t3-oss/env-core"
import z from "zod"

export const keys = () =>
  createEnv({
    server: {
      CLICKHOUSE_URL: z.url(),
      CLICKHOUSE_USER: z.string().min(1),
      CLICKHOUSE_PASSWORD: z.string().min(1),
      CLICKHOUSE_DB: z.string().min(1),
      CLICKHOUSE_REQUEST_TIMEOUT: z.int().positive().default(300_000),
    },
    clientPrefix: "CHATBOTX_PUBLIC_",
    client: {},
    runtimeEnv: process.env,
  })
