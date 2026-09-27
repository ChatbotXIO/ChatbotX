import {
  getRealtimeStreamKey,
  type RealtimeStreamRecord,
} from "@chatbotx.io/realtime-protocol"
import { createRedisConnection, type Redis } from "@chatbotx.io/redis"
import { resolveRealtimeRedisUrl } from "./settings"

const REALTIME_STREAM_RETENTION_MS = 5 * 60 * 1000

let realtimeStreamConnection: Redis | null = null

const getRealtimeStreamConnection = (): Redis =>
  (realtimeStreamConnection ??= createRedisConnection(
    resolveRealtimeRedisUrl(),
  ))

/**
 * Appends a pre-serialized protocol record to its workspace shard. Callers that
 * batch events supply this form so each event is serialized exactly once.
 */
export const publishSerializedRealtimeStreamRecord = async (
  workspaceId: string,
  serializedRecord: string,
): Promise<void> => {
  await getRealtimeStreamConnection().xadd(
    getRealtimeStreamKey(workspaceId),
    "MINID",
    "~",
    `${Date.now() - REALTIME_STREAM_RETENTION_MS}-0`,
    "*",
    "record",
    serializedRecord,
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

export const resetRealtimeStreamPublisherForTests = (): void => {
  realtimeStreamConnection = null
}
