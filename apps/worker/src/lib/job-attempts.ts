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
 * Counterpart to {@link isFinalAttempt}: use this from a worker's `failed`
 * event (BullMQ has already counted the failed attempt), and
 * {@link isFinalAttempt} from inside a handler (it has not) — mixing them up
 * reports a job finished one attempt early. `failed` fires on every attempt,
 * so for a queue like `whatsappVoipSignaling` where retries are expected
 * (until a separate job creates the call row), logging each as an error
 * makes a healthy race look like an outage.
 */
export const hasExhaustedAttempts = (job: Job): boolean =>
  job.attemptsMade >= (job.opts.attempts ?? 1)
