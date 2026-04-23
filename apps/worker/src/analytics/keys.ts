import { createEnv } from "@t3-oss/env-core"
import z from "zod"

export const env = createEnv({
  server: {
    CLICKHOUSE_DB: z.string(),
    CLICKHOUSE_BATCH_SIZE: z.coerce.number().default(10),
    CLICKHOUSE_MAX_RETRIES: z.coerce.number().default(5),
  },
  runtimeEnv: process.env,
})
