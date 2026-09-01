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
    AI_AGENT_WORKER_CONCURRENCY: z.coerce
      .number()
      .int()
      .min(1)
      .max(200)
      .default(5),
    HEAVY_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(3).default(1),
    HEAVY_JOB_WAIT_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(5000)
      .max(9 * 60 * 1000)
      .default(120_000),
    HEAVY_MAX_FILE_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(100 * 1024 * 1024)
      .default(50 * 1024 * 1024),
    HEAVY_MAX_AUDIO_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(100 * 1024 * 1024)
      .default(25 * 1024 * 1024),
    HEAVY_MAX_IMAGE_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(25 * 1024 * 1024)
      .default(10 * 1024 * 1024),
    HEAVY_MAX_EXTRACTED_TEXT_CHARS: z.coerce
      .number()
      .int()
      .min(1)
      .max(10_000_000)
      .default(5_000_000),
    HEAVY_MAX_CHUNKS_PER_FILE: z.coerce
      .number()
      .int()
      .min(1)
      .max(10_000)
      .default(5000),
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
    NOTIFICATION_WORKER_CONCURRENCY: z.coerce
      .number()
      .int()
      .min(1)
      .max(200)
      .default(10),
    // Expo push access token. Only needed if Expo's "enhanced push security"
    // is enabled on the project; unauthenticated requests work otherwise.
    EXPO_ACCESS_TOKEN: z.string().optional(),
    // Kill switch — Expo needs no credential to send, so unlike FCM there is
    // no natural "unset = disabled" signal. Operators flip this explicitly.
    EXPO_PUSH_ENABLED: z.stringbool().default(true),
  },
  runtimeEnv: process.env,
  skipValidation: process.env.SKIP_ENV_CHECK === "true",
})
