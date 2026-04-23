import { createEnv } from "@t3-oss/env-core"
import z from "zod"

export const env = createEnv({
  server: {
    SCHEDULER_BUCKET_RANGE: z.string(),
    BOOTSTRAP_INTERVAL_MS: z.coerce.number().default(3_600_000),
    CLEANUP_INTERVAL_MS: z.coerce.number().default(21_600_000),
    BATCH_SIZE: z.coerce.number().default(1000),
    TOTAL_BUCKETS: z.coerce.number().default(256),
  },
  runtimeEnv: process.env,
})
