import {
  getRealtimeStreamKey,
  isRealtimeSeqAfter,
  STREAM_ID_PATTERN,
} from "@chatbotx.io/realtime-protocol"
import type { Redis } from "@chatbotx.io/redis"
import type { StreamRecordEntry } from "./delivery"
import { logger } from "./logger"
import { parseStreamRecord, type StreamEntry } from "./stream-reader"

/** Replay window cap — also the "too large, just resync" threshold. */
export const MAX_REPLAY_ENTRIES = 500

const REPLAY_PAGE_SIZE = MAX_REPLAY_ENTRIES + 1
/** A shard's stream is shared by every workspace hashed to it (~1/256 of
 * all workspaces, see `getRealtimeStreamShard`). A single `XRANGE` page can
 * be entirely a noisy neighbor's traffic, so replaying THIS workspace's own
 * window means paging through the shard until enough of ITS OWN entries
 * are collected — bounded here so a pathologically busy shard can't turn
 * one connect's replay into an unbounded Redis scan; hitting the bound is
 * itself a legitimate signal to resync instead of paging indefinitely. See
 * PR #1349 round-4 finding #4.
 */
const MAX_REPLAY_SCAN_ENTRIES = REPLAY_PAGE_SIZE * 20

export type ReplayResult = {
  closeReason?: string
  /** Entries whose record (or part of it) couldn't be parsed during replay,
   * attributed to THIS workspace only (a shard is shared by every
   * workspace hashed to it — see `getRealtimeStreamShard` — so a malformed
   * entry belonging to a different workspace must never count against this
   * one). Bumped into `counters.malformedRecords` by the caller, which also
   * forces this connect to resync (`closeReason`) instead of silently
   * opening with a confirmed gap: the live dispatch path only resyncs
   * sockets that were already connected when the record first arrived, not
   * one reconnecting now with a `lastSeq` from before that point. See
   * PR #1349 round-4 finding #6.
   */
  droppedCount?: number
  entries: StreamRecordEntry[]
  lastStreamId?: string
}

export const loadReplay = async ({
  lastSeq,
  redis,
  workspaceId,
}: {
  lastSeq?: string
  redis: Redis
  workspaceId: string
}): Promise<ReplayResult> => {
  if (!lastSeq) {
    return { entries: [] }
  }
  if (!STREAM_ID_PATTERN.test(lastSeq)) {
    return { closeReason: "invalid-last-seq", entries: [] }
  }

  const streamKey = getRealtimeStreamKey(workspaceId)
  const [oldestEntries, newestEntries] = (await Promise.all([
    redis.xrange(streamKey, "-", "+", "COUNT", 1),
    redis.xrevrange(streamKey, "+", "-", "COUNT", 1),
  ])) as [StreamEntry[], StreamEntry[]]
  const oldestEntry = oldestEntries[0]
  const newestEntry = newestEntries[0]
  if (oldestEntry && isRealtimeSeqAfter(oldestEntry[0], lastSeq)) {
    return { closeReason: "replay-window-expired", entries: [] }
  }
  if (
    (!newestEntry && lastSeq !== "0-0") ||
    (newestEntry && isRealtimeSeqAfter(lastSeq, newestEntry[0]))
  ) {
    return { closeReason: "replay-cursor-ahead", entries: [] }
  }

  const parsedEntries: StreamRecordEntry[] = []
  let droppedCount = 0
  let cursor = lastSeq
  let lastScannedId: string | undefined
  let scannedCount = 0
  let reachedEnd = false
  for (;;) {
    const page = (await redis.xrange(
      streamKey,
      `(${cursor}`,
      "+",
      "COUNT",
      REPLAY_PAGE_SIZE,
    )) as StreamEntry[]
    if (page.length === 0) {
      reachedEnd = true
      break
    }
    for (const [id, fields] of page) {
      lastScannedId = id
      scannedCount += 1
      const parsed = parseStreamRecord(fields)
      const entryWorkspaceId = parsed.ok
        ? parsed.record.workspaceId
        : parsed.workspaceId
      if (entryWorkspaceId !== workspaceId) {
        continue
      }
      if (!parsed.ok) {
        droppedCount += 1
        logger.error(
          { err: parsed.error, id, workspaceId },
          "Ignoring invalid realtime stream entry during replay",
        )
        continue
      }
      if (parsed.droppedCount) {
        droppedCount += parsed.droppedCount
      }
      parsedEntries.push({ id, record: parsed.record })
      if (parsedEntries.length > MAX_REPLAY_ENTRIES) {
        return { closeReason: "replay-window-too-large", entries: [] }
      }
    }
    cursor = lastScannedId ?? cursor
    if (page.length < REPLAY_PAGE_SIZE) {
      reachedEnd = true
      break
    }
    if (scannedCount >= MAX_REPLAY_SCAN_ENTRIES) {
      break
    }
  }
  if (!reachedEnd) {
    return { closeReason: "replay-window-too-large", entries: [] }
  }

  const currentOldestEntries = (await redis.xrange(
    streamKey,
    "-",
    "+",
    "COUNT",
    1,
  )) as StreamEntry[]
  const currentOldestEntry = currentOldestEntries[0]
  if (
    currentOldestEntry &&
    isRealtimeSeqAfter(currentOldestEntry[0], lastSeq)
  ) {
    return { closeReason: "replay-window-expired", entries: [] }
  }

  return {
    droppedCount: droppedCount || undefined,
    entries: parsedEntries,
    lastStreamId: lastScannedId ?? lastSeq,
  }
}
