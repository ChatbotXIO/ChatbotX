import {
  getRealtimeStreamKey,
  getRealtimeStreamShard,
  isRealtimeSeqAfter,
  type RealtimeEventEnvelope,
  type RealtimeStreamRecord,
  realtimeEventEnvelopeSchema,
  realtimeStreamRecordSchema,
} from "@chatbotx.io/realtime-protocol"
import type { Redis } from "@chatbotx.io/redis"
import { z } from "zod"
import { logger } from "./logger"

const STREAM_READ_BLOCK_MS = 1000
const STREAM_READ_COUNT = 200
const RECENT_ENTRY_LIMIT = 512
const DEACTIVATION_DELAY_MS = 30_000
const IDLE_RETRY_MS = 250
const ERROR_RETRY_MS = 1000

type StreamFieldList = [string, string][] | string[]
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
  activeShardCount: () => number
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

/** A loose, best-effort read of `kind`/`workspaceId` only — used to recover
 * enough identity to log and signal a resync even when the full record
 * schema below rejects the entry (e.g. a rolling deploy skew). */
const looseStreamRecordShapeSchema = z.object({
  events: z.unknown().optional(),
  kind: z.string(),
  workspaceId: z.string().min(1),
})

export type ParsedStreamRecord =
  | { ok: true; record: RealtimeStreamRecord }
  | { error: unknown; ok: false; workspaceId?: string }

export const parseStreamRecord = (
  fields: StreamFieldList,
): ParsedStreamRecord => {
  const serializedRecord = toFieldMap(fields).get("record")
  if (!serializedRecord) {
    return { error: new Error("Stream entry has no 'record' field"), ok: false }
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(serializedRecord)
  } catch (error) {
    return { error, ok: false }
  }

  const looseShape = looseStreamRecordShapeSchema.safeParse(parsedJson)
  const workspaceId = looseShape.success
    ? looseShape.data.workspaceId
    : undefined

  // A rolling deploy can have the worker publish a newer event shape than
  // this build's envelope schema knows. Validating `events` per item instead
  // of rejecting the whole `.min(1)` array keeps every *other* valid event in
  // the same coalesced batch deliverable instead of discarding the record.
  if (looseShape.success && looseShape.data.kind === "workspace-events") {
    const rawEvents = looseShape.data.events
    if (Array.isArray(rawEvents)) {
      const validEvents: RealtimeEventEnvelope[] = []
      for (const rawEvent of rawEvents) {
        const result = realtimeEventEnvelopeSchema.safeParse(rawEvent)
        if (result.success) {
          validEvents.push(result.data)
        }
      }
      if (validEvents.length > 0) {
        return {
          ok: true,
          record: {
            events: validEvents,
            kind: "workspace-events",
            workspaceId: looseShape.data.workspaceId,
          },
        }
      }
      return {
        error: new Error("workspace-events record has no valid events"),
        ok: false,
        workspaceId,
      }
    }
  }

  const result = realtimeStreamRecordSchema.safeParse(parsedJson)
  if (result.success) {
    return { ok: true, record: result.data }
  }
  return { error: result.error, ok: false, workspaceId }
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
  onInvalidRecord,
  onReady,
  redis,
}: {
  onEntries: (entries: StreamRecordEntry[]) => void
  onError: (error: unknown) => void
  /** Called once per entry whose record couldn't be fully parsed — the
   * gateway uses this to bump a metric and force an affected workspace's
   * sockets to resync instead of silently running with a permanent gap. */
  onInvalidRecord: (info: { id: string; workspaceId?: string }) => void
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
        if (!isRealtimeSeqAfter(id, activeShard.lastId)) {
          continue
        }
        activeShard.lastId = id
        const parsed = parseStreamRecord(fields)
        if (!parsed.ok) {
          logger.error(
            {
              err: parsed.error,
              id,
              streamKey,
              workspaceId: parsed.workspaceId,
            },
            "Ignoring malformed realtime stream entry",
          )
          onInvalidRecord({ id, workspaceId: parsed.workspaceId })
          continue
        }
        const entry = { id, record: parsed.record }
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
    activeShardCount: () => activeShards.size,
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
        (entry) => !afterId || isRealtimeSeqAfter(entry.id, afterId),
      )
    },
    releaseWorkspace,
    start: () => {
      loop ??= run()
    },
  }
}
