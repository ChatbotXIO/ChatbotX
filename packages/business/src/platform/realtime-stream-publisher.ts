import {
  getRealtimeStreamKey,
  type RealtimeStreamRecord,
} from "@chatbotx.io/partysocket-config"
import { createRedisConnection, type Redis } from "@chatbotx.io/redis"
import { resolveRealtimeRedisUrl } from "./settings"

const REALTIME_STREAM_MAX_LENGTH = 100_000

let realtimeStreamConnection: Redis | null = null

const getRealtimeStreamConnection = (): Redis =>
  (realtimeStreamConnection ??= createRedisConnection(
    resolveRealtimeRedisUrl(),
  ))

/**
 * Appends one protocol record to its workspace shard. Connection creation is
 * deferred until the first publish so importing business services never opens
 * a Redis connection.
 */
export const publishRealtimeStreamRecord = async (
  record: RealtimeStreamRecord,
): Promise<void> => {
  await getRealtimeStreamConnection().xadd(
    getRealtimeStreamKey(record.workspaceId),
    "MAXLEN",
    "~",
    REALTIME_STREAM_MAX_LENGTH,
    "*",
    "record",
    JSON.stringify(record),
  )
}

export const resetRealtimeStreamPublisherForTests = (): void => {
  realtimeStreamConnection = null
}
