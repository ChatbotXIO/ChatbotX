import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

const editionRule = z
  .enum(["community", "enterprise", "cloud"])
  .default("community")

export const env = createEnv({
  server: {
    NEXT_PUBLIC_EDITION: editionRule,
    QUOTA_SYNC_INTERVAL_SECONDS: z.coerce.number().int().min(10).default(60),
    WEBHOOK_WORKER_CONCURRENCY: z.coerce
      .number()
      .int()
      .min(1)
      .max(200)
      .default(50),
    INTEGRATION_WORKER_CONCURRENCY: z.coerce
      .number()
      .int()
      .min(1)
      .max(200)
      .default(10),
    // Bounds each chat-job wait (awaitChatJob). Capped below the integration
    // worker lockDuration (10 min) so a wait can never outlive the job lock —
    // otherwise BullMQ would treat the job as stalled and reprocess it (double
    // send). Validated so a bad value can't become NaN (= wait forever).
    CHAT_JOB_WAIT_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(9 * 60 * 1000)
      .default(120_000),
  },
  runtimeEnv: process.env,
  skipValidation: process.env.SKIP_ENV_CHECK === "true",
})
