import { LockAcquisitionError } from "@chatbotx.io/redis"
import { DelayedError, type Job } from "bullmq"
import { logger } from "./logger"

/**
 * How an integration job treats a distributed-lock race. Losing the race is
 * contention, not a failure: the job polls the lock for five 200 ms Redlock
 * retry steps (`lockWaitSeconds`), then frees its worker slot and is parked in
 * BullMQ's delayed set. Eight jittered deferrals provide ample wall time for a
 * genuine inbound burst to drain before the error fails the attempt normally.
 * Handlers that take a contended lock pass `lockWaitSeconds` to the service
 * so the wait and the deferral stay one policy.
 */
export const LOCK_CONTENTION_POLICY = {
  lockWaitSeconds: 1,
  maxDeferrals: 8,
  baseDelayMs: 2000,
  maxDelayMs: 30_000,
} as const

/** The slice of a BullMQ job the deferral needs; narrow so tests need no casts. */
export type DeferrableJob = Pick<
  Job,
  "id" | "name" | "attemptsStarted" | "attemptsMade" | "moveToDelayed"
>

/**
 * How many times the current attempt has already been deferred. BullMQ bumps
 * `attemptsStarted` on every activation (including one that follows a
 * `moveToDelayed`) but `attemptsMade` only on a real failure, so their gap is
 * the deferral count without any extra bookkeeping on the job data.
 */
export const deferralsSoFar = (
  job: Pick<DeferrableJob, "attemptsStarted" | "attemptsMade">,
): number => Math.max(0, job.attemptsStarted - job.attemptsMade - 1)

/** Exponential backoff with equal jitter, capped at `maxDelayMs`. */
export const lockContentionDelayMs = (
  deferral: number,
  random: () => number = Math.random,
): number => {
  const ceiling = Math.min(
    LOCK_CONTENTION_POLICY.baseDelayMs * 2 ** deferral,
    LOCK_CONTENTION_POLICY.maxDelayMs,
  )
  const half = ceiling / 2
  return Math.round(half + random() * half)
}

// `instanceof` plus the name check, mirroring how BullMQ itself recognises its
// control-flow errors, so a duplicated `redlock-universal` module instance can
// never turn contention back into a hard failure.
const isLockAcquisitionError = (
  error: unknown,
): error is LockAcquisitionError =>
  error instanceof LockAcquisitionError ||
  (error instanceof Error && error.name === "LockAcquisitionError")

/**
 * Run `process`; if it fails only because a distributed lock could not be
 * acquired, defer the job instead of failing the attempt. Requires the
 * worker's lock `token` (BullMQ needs it to move an active job); without one
 * the error propagates unchanged.
 */
export const deferOnLockContention = async <T>(
  job: DeferrableJob,
  token: string | undefined,
  process: () => Promise<T>,
): Promise<T> => {
  try {
    return await process()
  } catch (error) {
    if (!isLockAcquisitionError(error) || token === undefined) {
      throw error
    }
    const deferral = deferralsSoFar(job)
    if (deferral >= LOCK_CONTENTION_POLICY.maxDeferrals) {
      throw error
    }
    const delayMs = lockContentionDelayMs(deferral)
    logger.warn(
      { err: error, jobId: job.id, jobName: job.name, deferral, delayMs },
      "Distributed lock contention; deferring job instead of failing it",
    )
    await job.moveToDelayed(Date.now() + delayMs, token)
    throw new DelayedError()
  }
}
