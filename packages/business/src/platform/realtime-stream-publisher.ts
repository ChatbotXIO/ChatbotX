import {
  getRealtimeStreamKey,
  type RealtimeStreamRecord,
} from "@chatbotx.io/realtime-protocol"
import { createRedisConnection, type Redis } from "@chatbotx.io/redis"
import { resolveRealtimeRedisUrl } from "./settings"

const REALTIME_STREAM_RETENTION_MS = 5 * 60 * 1000

/** A transient Redis blip (brief network hiccup, failover) must not
 * permanently drop a realtime event with no gap signal to clients —
 * especially fire-and-forget guest publishes, which have no caller-level
 * retry of their own. Bounded so a genuine outage still fails fast instead
 * of queueing indefinitely. See PR #1349 finding #7. */
const PUBLISH_RETRY_ATTEMPTS = 3
const PUBLISH_RETRY_DELAY_MS = 100

let realtimeStreamConnection: Redis | null = null

const delay = (ms: number): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, ms)
  return promise
}

const getRealtimeStreamConnection = (): Redis =>
  (realtimeStreamConnection ??= createRedisConnection(
    resolveRealtimeRedisUrl(),
    // A hung `xadd` during a Redis outage would stall this package's publish
    // path forever: ioredis's default `maxRetriesPerRequest: null` queues the
    // command indefinitely instead of rejecting it. Fail fast so callers that
    // await a publish (whatsapp call/VoIP signaling, guest publish) and
    // fire-and-forget callers (`queueWorkspaceRealtimeEvent`'s `.catch`) both
    // observe the failure instead of hanging.
    {
      commandTimeout: 2000,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    },
  ))

/**
 * Appends a pre-serialized protocol record to its workspace shard. Callers that
 * batch events supply this form so each event is serialized exactly once.
 */
export const publishSerializedRealtimeStreamRecord = async (
  workspaceId: string,
  serializedRecord: string,
): Promise<void> => {
  let lastError: unknown
  for (let attempt = 1; attempt <= PUBLISH_RETRY_ATTEMPTS; attempt += 1) {
    try {
      await getRealtimeStreamConnection().xadd(
        getRealtimeStreamKey(workspaceId),
        "MINID",
        "~",
        `${Date.now() - REALTIME_STREAM_RETENTION_MS}-0`,
        "*",
        "record",
        serializedRecord,
      )
      return
    } catch (error) {
      lastError = error
      if (attempt < PUBLISH_RETRY_ATTEMPTS) {
        await delay(PUBLISH_RETRY_DELAY_MS * attempt)
      }
    }
  }
  throw lastError
}

/**
 * Appends one protocol record to its workspace shard. Connection creation is
 * deferred until the first publish so importing business services never opens
 * a Redis connection.
 */
export const publishRealtimeStreamRecord = async (
  record: RealtimeStreamRecord,
): Promise<void> =>
  await publishSerializedRealtimeStreamRecord(
    record.workspaceId,
    JSON.stringify(record),
  )

export const resetRealtimeStreamPublisherForTests = (): void => {
  realtimeStreamConnection = null
}
