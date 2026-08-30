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
    // send). Validated so a bad value can't become NaN (= wait forever). Since
    // the coexist split (heavy worker), this max (9 min) is the ONLY reason the
    // integration worker's lockDuration/stalledInterval stay at 10 min — see
    // `apps/worker/src/integration/worker.ts`.
    CHAT_JOB_WAIT_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(9 * 60 * 1000)
      .default(120_000),
    // Coexist historical sync (Messenger/Instagram pulls, WhatsApp staging
    // flushes, attachment-download fan-outs) runs on its own `heavy` worker so
    // it no longer competes with latency-sensitive integration jobs. Handlers
    // also self-throttle via the BUC adaptive throttle (usage-throttle.ts), so
    // this concurrency is a coarse upper bound, not the primary rate control.
    HEAVY_WORKER_CONCURRENCY: z.coerce
      .number()
      .int()
      .min(1)
      .max(200)
      .default(5),
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
