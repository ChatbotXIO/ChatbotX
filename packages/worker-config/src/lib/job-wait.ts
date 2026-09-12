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

// --- Strict variant (synchronous ESL API contract) ---------------
//
// `waitForIntegrationJobCompletion` above is deliberately best-effort: it
// swallows timeouts/failures because it only exists to preserve ordering.
// Callers that need the job's actual RESULT (e.g. `freeswitchApiClient.run`
// reading an ESL API reply) cannot use that semantics — a swallowed timeout
// would silently return `undefined` and look like success. `waitForJobResult`
// is the strict counterpart: it rejects on timeout or job failure.

const queueEventsByName = new Map<string, QueueEvents>()

/**
 * Lazily creates (and memoizes per queue name) a `QueueEvents` instance —
 * the same lazy-create pattern as `getIntegrationQueueEvents`, generalized
 * so per-node FreeSWITCH queues (`freeswitch:<nodeId>`) don't each need
 * their own hand-written singleton. Memoized instances live for the
 * process lifetime — there is no close-on-shutdown path, since the set is
 * bounded by the number of FreeSWITCH nodes, not by request volume.
 */
export function createQueueEvents(queueName: string): QueueEvents {
  const existing = queueEventsByName.get(queueName)
  if (existing) {
    return existing
  }
  const queueEvents = new QueueEvents(queueName, {
    connection: getRedisConnection().duplicate(),
  })
  queueEventsByName.set(queueName, queueEvents)
  return queueEvents
}

/**
 * Strict wait: resolves with the job's result, or REJECTS on timeout or job
 * failure — unlike {@link waitForIntegrationJobCompletion}, callers must
 * handle the rejection themselves (e.g. map it to a typed
 * `FreeswitchApiError`). Used by `freeswitchApiClient.run` to read back an
 * ESL API reply synchronously.
 */
export async function waitForJobResult<T>(
  job: Job<unknown, T>,
  queueEvents: QueueEvents,
  timeoutMs: number,
): Promise<T> {
  return await job.waitUntilFinished(queueEvents, timeoutMs)
}
