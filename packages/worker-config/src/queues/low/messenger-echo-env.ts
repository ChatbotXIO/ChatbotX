import { z } from "zod"

export const MESSENGER_ECHO_DEFAULTS = {
  flagTtlMs: 60_000,
  flushBatch: 200,
  listMaxBytes: 4 * 1024 * 1024,
  listMaxItems: 5000,
  listTtlSeconds: 6 * 60 * 60,
  sweepClaimTtlMs: 5 * 60 * 1000,
} as const

export const messengerEchoCollectorSharedEnv = {
  MESSENGER_ECHO_FLAG_TTL_MS: z.coerce
    .number()
    .int()
    .min(1)
    .default(MESSENGER_ECHO_DEFAULTS.flagTtlMs),
  MESSENGER_ECHO_LIST_MAX_ITEMS: z.coerce
    .number()
    .int()
    .min(1)
    .default(MESSENGER_ECHO_DEFAULTS.listMaxItems),
  MESSENGER_ECHO_LIST_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1)
    .default(MESSENGER_ECHO_DEFAULTS.listMaxBytes),
  MESSENGER_ECHO_LIST_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(1)
    .default(MESSENGER_ECHO_DEFAULTS.listTtlSeconds),
}

export const messengerEchoWorkerEnv = {
  ...messengerEchoCollectorSharedEnv,
  MESSENGER_ECHO_FLUSH_BATCH: z.coerce
    .number()
    .int()
    .min(1)
    .default(MESSENGER_ECHO_DEFAULTS.flushBatch),
  MESSENGER_ECHO_SWEEP_CLAIM_TTL_MS: z.coerce
    .number()
    .int()
    .min(1)
    .default(MESSENGER_ECHO_DEFAULTS.sweepClaimTtlMs),
}
