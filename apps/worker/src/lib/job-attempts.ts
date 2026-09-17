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

/**
 * True when BullMQ has spent every attempt on this job and will not retry.
 *
 * The counterpart to {@link isFinalAttempt}, for the OTHER side of a job's
 * life: use this from a worker's `failed` event, where BullMQ has already
 * counted the attempt that just failed, and {@link isFinalAttempt} from
 * inside a handler, where it has not. Mixing them up reports a job as
 * finished one attempt early.
 *
 * Worth distinguishing because a `failed` event fires on EVERY attempt, and
 * for a queue whose retries are an expected part of normal operation —
 * `whatsappVoipSignaling` retries until a separate job creates the call row —
 * logging each one as an error makes a healthy race look like an outage.
 */
export const hasExhaustedAttempts = (job: Job): boolean =>
  job.attemptsMade >= (job.opts.attempts ?? 1)
