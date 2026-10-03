import {
  getRealtimeMemberRevokedKey,
  getRealtimeStreamKey,
  REALTIME_MEMBER_REVOKED_TTL_SECONDS,
  type RealtimeStreamRecord,
} from "@chatbotx.io/realtime-protocol"
import { createRedisConnection, type Redis } from "@chatbotx.io/redis"
import { logger } from "../logger"
import { resolveRealtimeRedisUrl } from "./settings"

const REALTIME_STREAM_RETENTION_MS = 5 * 60 * 1000

/**
 * A transient Redis blip must not permanently drop a realtime event with no
 * gap signal to clients. Bounded retries still fail fast during an outage.
 */
const PUBLISH_RETRY_ATTEMPTS = 3
const PUBLISH_RETRY_DELAY_MS = 100

let realtimeStreamConnectionPromise: Promise<Redis> | null = null

const delay = (ms: number): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, ms)
  return promise
}

export const retryWithLinearBackoff = async <T>(
  fn: () => Promise<T>,
  options: { attempts: number; baseDelayMs: number; workspaceId: string },
): Promise<T> => {
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      if (attempt === options.attempts) {
        throw error
      }
      logger.warn(
        { attempt, err: error, workspaceId: options.workspaceId },
        "Realtime stream operation failed; retrying",
      )
      await delay(options.baseDelayMs * attempt)
    }
  }
  throw new Error("Realtime retry attempts exhausted")
}

const getRealtimeStreamConnection = async (): Promise<Redis> => {
  if (realtimeStreamConnectionPromise) {
    return await realtimeStreamConnectionPromise
  }

  const connection = createRedisConnection(
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
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    },
  )
  const connectionPromise = connection.connect().then(() => connection)
  realtimeStreamConnectionPromise = connectionPromise
  try {
    return await connectionPromise
  } catch (error) {
    if (realtimeStreamConnectionPromise === connectionPromise) {
      realtimeStreamConnectionPromise = null
      connection.disconnect()
    }
    throw error
  }
}

/**
 * Appends a pre-serialized protocol record to its workspace shard. Callers that
 * batch events supply this form so each event is serialized exactly once.
 */
export const publishSerializedRealtimeStreamRecord = async (
  workspaceId: string,
  serializedRecord: string,
): Promise<void> => {
  await retryWithLinearBackoff(
    async () => {
      const connection = await getRealtimeStreamConnection()
      await connection.xadd(
        getRealtimeStreamKey(workspaceId),
        "MINID",
        "~",
        `${Date.now() - REALTIME_STREAM_RETENTION_MS}-0`,
        "*",
        "record",
        serializedRecord,
      )
    },
    {
      attempts: PUBLISH_RETRY_ATTEMPTS,
      baseDelayMs: PUBLISH_RETRY_DELAY_MS,
      workspaceId,
    },
  )
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

/**
 * Records that a member's realtime connections were just revoked, so the
 * gateway can reject a reconnect from a still-unexpired token minted before
 * this moment. The TTL outlives every still-valid token minted before it.
 */
export const markRealtimeMemberRevoked = async (
  workspaceId: string,
  userId: string,
): Promise<void> => {
  const connection = await getRealtimeStreamConnection()
  await connection.set(
    getRealtimeMemberRevokedKey(workspaceId, userId),
    `${Date.now()}`,
    "EX",
    REALTIME_MEMBER_REVOKED_TTL_SECONDS,
  )
}

export const resetRealtimeStreamPublisherForTests = (): void => {
  realtimeStreamConnectionPromise = null
}
