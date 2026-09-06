import type { Job } from "bullmq"
import { QueueEvents } from "bullmq"
import { getRedisConnection } from "./connection"
import { queueNames } from "./types"

// Bounds the wait so a stalled/backlogged integration worker can never block
// the caller indefinitely — an unbounded wait would leak a QueueEvents
// listener and its captured closures forever. Kept short: this only exists to
// preserve message ordering (e.g. a triggered confirmation flow landing
// before the caller's own next step), not to babysit the triggered flow to
// completion.
const INTEGRATION_JOB_WAIT_TIMEOUT_MS = 10_000

type JobSnapshot = {
  attemptsMade?: number
  opts?: { attempts?: number }
}

type JobLookupQueue = {
  getJob?: (jobId: string) => Promise<JobSnapshot | undefined>
}

type WaitableJob<TQueueEvents> = JobSnapshot & {
  id?: string
  waitUntilFinished: (
    queueEvents: TQueueEvents,
    timeoutMs?: number,
  ) => Promise<unknown>
}

/**
 * The caller could not establish whether the heavy job has exhausted its
 * retries. This must be retried by the parent job instead of being recorded
 * as a terminal provider failure.
 */
export class JobCompletionStateUnknownError extends Error {
  constructor(cause: unknown) {
    super("Unable to determine whether the queued job has finished retrying", {
      cause,
    })
    this.name = "JobCompletionStateUnknownError"
  }
}

let integrationQueueEvents: QueueEvents | null = null
let heavyQueueEvents: QueueEvents | null = null

function getIntegrationQueueEvents(): QueueEvents {
  if (integrationQueueEvents) {
    return integrationQueueEvents
  }

  integrationQueueEvents = new QueueEvents(queueNames.enum.integration, {
    connection: getRedisConnection().duplicate(),
  })
  return integrationQueueEvents
}

export async function closeIntegrationQueueEvents(): Promise<void> {
  if (integrationQueueEvents) {
    await integrationQueueEvents.close()
    integrationQueueEvents = null
  }
}

export function getHeavyQueueEvents(): QueueEvents {
  if (heavyQueueEvents) {
    return heavyQueueEvents
  }

  heavyQueueEvents = new QueueEvents(queueNames.enum.heavy, {
    connection: getRedisConnection().duplicate(),
  })
  return heavyQueueEvents
}

export async function closeHeavyQueueEvents(): Promise<void> {
  if (heavyQueueEvents) {
    await heavyQueueEvents.close()
    heavyQueueEvents = null
  }
}

/**
 * Wait until a BullMQ job reaches a terminal state, including retries.
 *
 * BullMQ emits a `failed` event for every failed attempt, not only after the
 * final attempt. `Job.waitUntilFinished()` rejects on each of those events,
 * so callers that need the final result must re-attach while attempts remain.
 * The timeout is an overall deadline for the wait, including backoff time.
 */
export async function waitForJobCompletionWithRetries<TQueueEvents>(
  job: WaitableJob<TQueueEvents> | undefined,
  queue: JobLookupQueue,
  queueEvents: TQueueEvents,
  timeoutMs: number,
): Promise<unknown> {
  if (!job) {
    throw new Error("Queue did not return a waitable job")
  }

  const deadline = Date.now() + timeoutMs
  let lastError: unknown

  while (true) {
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) {
      throw lastError ?? new Error("Job wait timed out before finishing")
    }

    try {
      return await job.waitUntilFinished(queueEvents, remainingMs)
    } catch (error) {
      lastError = error

      if (!(job.id && queue.getJob)) {
        throw error
      }

      let latestJob: JobSnapshot | undefined
      try {
        latestJob = await queue.getJob(job.id)
      } catch (lookupError) {
        throw new JobCompletionStateUnknownError(lookupError)
      }

      if (!latestJob) {
        throw new JobCompletionStateUnknownError(
          new Error(`Unable to load queued job ${job.id}`),
        )
      }

      const attemptsMade = latestJob.attemptsMade ?? job.attemptsMade ?? 0
      const attempts = latestJob.opts?.attempts ?? job.opts?.attempts ?? 1

      if (attemptsMade >= attempts) {
        throw error
      }
    }
  }
}

/**
 * Block until an enqueued integration job (e.g. a `sendFlow` trigger) reaches
 * a terminal state, so work the caller does after enqueueing it — like
 * routing to its own next step — cannot race ahead of it. Bounded and
 * non-throwing: a timeout or job failure is swallowed so this is always
 * best-effort ordering, never a reason to fail the caller.
 */
export async function waitForIntegrationJobCompletion(
  job: Job | string | undefined,
): Promise<void> {
  if (!(job && typeof job === "object" && "waitUntilFinished" in job)) {
    return
  }

  try {
    await job.waitUntilFinished(
      getIntegrationQueueEvents(),
      INTEGRATION_JOB_WAIT_TIMEOUT_MS,
    )
  } catch {
    // Best-effort ordering only — never rethrow.
  }
}
