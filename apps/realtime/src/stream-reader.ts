import {
  getRealtimeStreamKey,
  getRealtimeStreamShard,
  type RealtimeStreamRecord,
  realtimeStreamRecordSchema,
} from "@chatbotx.io/realtime-protocol"
import type { Redis } from "@chatbotx.io/redis"

const STREAM_READ_BLOCK_MS = 1000
const STREAM_READ_COUNT = 200
const RECENT_ENTRY_LIMIT = 512
const DEACTIVATION_DELAY_MS = 30_000
const IDLE_RETRY_MS = 250
const ERROR_RETRY_MS = 1000

export type StreamFieldList = [string, string][] | string[]
export type StreamEntry = [string, StreamFieldList]
type StreamReadResult = [string, StreamEntry[]][]

type ActiveShard = {
  deactivateTimer: NodeJS.Timeout | null
  lastId: string
  recentEntries: StreamRecordEntry[]
  socketCount: number
  streamKey: string
}

export type StreamRecordEntry = {
  id: string
  record: RealtimeStreamRecord
}

export type StreamReader = {
  activateWorkspace: (workspaceId: string) => Promise<string>
  close: () => Promise<void>
  getRecentEntries: (
    workspaceId: string,
    afterId?: string,
  ) => StreamRecordEntry[]
  releaseWorkspace: (workspaceId: string) => void
  start: () => void
}

const toFieldMap = (fields: StreamFieldList): Map<string, string> => {
  if (fields.length === 0) {
    return new Map()
  }
  if (Array.isArray(fields[0])) {
    return new Map(fields as [string, string][])
  }

  const fieldMap = new Map<string, string>()
  const flattenedFields = fields as string[]
  for (let index = 0; index < flattenedFields.length; index += 2) {
    const key = flattenedFields[index]
    const value = flattenedFields[index + 1]
    if (key !== undefined && value !== undefined) {
      fieldMap.set(key, value)
    }
  }
  return fieldMap
}

export const parseStreamRecord = (
  fields: StreamFieldList,
): RealtimeStreamRecord | null => {
  const serializedRecord = toFieldMap(fields).get("record")
  if (!serializedRecord) {
    return null
  }

  try {
    return realtimeStreamRecordSchema.parse(JSON.parse(serializedRecord))
  } catch {
    return null
  }
}

export const isStreamIdBefore = (left: string, right: string): boolean => {
  const [leftMilliseconds, leftSequence] = left.split("-").map(BigInt)
  const [rightMilliseconds, rightSequence] = right.split("-").map(BigInt)
  return (
    leftMilliseconds < rightMilliseconds ||
    (leftMilliseconds === rightMilliseconds && leftSequence < rightSequence)
  )
}

const getLatestStreamId = async (
  redis: Redis,
  streamKey: string,
): Promise<string> => {
  const entries = (await redis.xrevrange(
    streamKey,
    "+",
    "-",
    "COUNT",
    1,
  )) as StreamEntry[]
  return entries[0]?.[0] ?? "0-0"
}

export const createStreamReader = ({
  onEntries,
  onError,
  onReady,
  redis,
}: {
  onEntries: (entries: StreamRecordEntry[]) => void
  onError: (error: unknown) => void
  onReady: () => void
  redis: Redis
}): StreamReader => {
  const activeShards = new Map<number, ActiveShard>()
  const activatingShards = new Map<number, Promise<ActiveShard>>()
  let reader: Redis | null = null
  let stopped = false
  let loop: Promise<void> | null = null

  const getActiveShards = (): ActiveShard[] => [...activeShards.values()]

  const deactivateShard = (shard: number): void => {
    const activeShard = activeShards.get(shard)
    if (!activeShard || activeShard.socketCount > 0) {
      return
    }
    if (activeShard.deactivateTimer) {
      clearTimeout(activeShard.deactivateTimer)
    }
    activeShards.delete(shard)
  }

  const appendRecentEntry = (
    activeShard: ActiveShard,
    entry: StreamRecordEntry,
  ): void => {
    activeShard.recentEntries.push(entry)
    if (activeShard.recentEntries.length > RECENT_ENTRY_LIMIT) {
      activeShard.recentEntries.shift()
    }
  }

  const activateWorkspace = async (workspaceId: string): Promise<string> => {
    const shard = getRealtimeStreamShard(workspaceId)
    const existingShard = activeShards.get(shard)
    if (existingShard) {
      existingShard.socketCount += 1
      if (existingShard.deactivateTimer) {
        clearTimeout(existingShard.deactivateTimer)
        existingShard.deactivateTimer = null
      }
      return existingShard.lastId
    }

    const activatingShard = activatingShards.get(shard)
    if (activatingShard) {
      const activeShard = await activatingShard
      activeShard.socketCount += 1
      return activeShard.lastId
    }

    const streamKey = getRealtimeStreamKey(workspaceId)
    const activation = (async (): Promise<ActiveShard> => {
      const activeShard: ActiveShard = {
        deactivateTimer: null,
        lastId: await getLatestStreamId(redis, streamKey),
        recentEntries: [],
        socketCount: 1,
        streamKey,
      }
      activeShards.set(shard, activeShard)
      return activeShard
    })()
    activatingShards.set(shard, activation)
    try {
      return (await activation).lastId
    } finally {
      activatingShards.delete(shard)
    }
  }

  const releaseWorkspace = (workspaceId: string): void => {
    const shard = getRealtimeStreamShard(workspaceId)
    const activeShard = activeShards.get(shard)
    if (!activeShard || activeShard.socketCount === 0) {
      return
    }

    activeShard.socketCount -= 1
    if (activeShard.socketCount > 0 || activeShard.deactivateTimer) {
      return
    }
    activeShard.deactivateTimer = setTimeout(
      () => deactivateShard(shard),
      DEACTIVATION_DELAY_MS,
    )
  }

  const dispatchEntries = (response: StreamReadResult): void => {
    const dispatchedEntries: StreamRecordEntry[] = []
    for (const [streamKey, entries] of response) {
      const activeShard = getActiveShards().find(
        (candidate) => candidate.streamKey === streamKey,
      )
      if (!activeShard) {
        continue
      }
      for (const [id, fields] of entries) {
        if (!isStreamIdBefore(activeShard.lastId, id)) {
          continue
        }
        activeShard.lastId = id
        const record = parseStreamRecord(fields)
        if (!record) {
          continue
        }
        const entry = { id, record }
        appendRecentEntry(activeShard, entry)
        dispatchedEntries.push(entry)
      }
    }
    if (dispatchedEntries.length > 0) {
      onEntries(dispatchedEntries)
    }
  }

  const run = async (): Promise<void> => {
    reader = redis.duplicate()
    try {
      while (!stopped) {
        const activeShardsSnapshot = getActiveShards()
        if (activeShardsSnapshot.length === 0) {
          await new Promise((resolve) => setTimeout(resolve, IDLE_RETRY_MS))
          continue
        }

        try {
          const response = (await reader.call(
            "XREAD",
            "BLOCK",
            STREAM_READ_BLOCK_MS,
            "COUNT",
            STREAM_READ_COUNT,
            "STREAMS",
            ...activeShardsSnapshot.map((activeShard) => activeShard.streamKey),
            ...activeShardsSnapshot.map((activeShard) => activeShard.lastId),
          )) as StreamReadResult | null
          onReady()
          if (response) {
            dispatchEntries(response)
          }
        } catch (error) {
          onError(error)
          await new Promise((resolve) => setTimeout(resolve, ERROR_RETRY_MS))
        }
      }
    } finally {
      reader.disconnect()
      reader = null
    }
  }

  return {
    activateWorkspace,
    close: async () => {
      stopped = true
      for (const [shard, activeShard] of activeShards) {
        if (activeShard.deactivateTimer) {
          clearTimeout(activeShard.deactivateTimer)
        }
        activeShards.delete(shard)
      }
      reader?.disconnect()
      await loop
    },
    getRecentEntries: (workspaceId, afterId) => {
      const activeShard = activeShards.get(getRealtimeStreamShard(workspaceId))
      if (!activeShard) {
        return []
      }
      return activeShard.recentEntries.filter(
        (entry) => !afterId || isStreamIdBefore(afterId, entry.id),
      )
    },
    releaseWorkspace,
    start: () => {
      loop ??= run()
    },
  }
}
