import type { Job } from "bullmq"

/**
 * True when BullMQ will not retry this job after the current attempt.
 *
 * A handler that records a failure *and* rethrows must gate the recording on
 * this. `defaultJobOptions.attempts` is 2, so an ungated
 * `logProviderError(...); throw error` writes two `ErrorLog` rows for one
 * logical failure — exactly what the terminal-failure-only rule in
 * `record-provider-error-log.ts` exists to prevent.
 */
export const isFinalAttempt = (job: Job): boolean =>
  job.attemptsMade + 1 >= (job.opts.attempts ?? 1)
