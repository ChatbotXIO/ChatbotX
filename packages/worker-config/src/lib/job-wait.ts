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

let integrationQueueEvents: QueueEvents | null = null

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
