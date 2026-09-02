import { PgDialect } from "drizzle-orm/pg-core"
import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// broadcast-purge repository — composite-key chunked recipient purge plus the
// listing/probe/hard-delete helpers that drive the schedule:purge-broadcasts
// handler. Mocks only `db.execute` (real `sql` template tag from
// drizzle-orm/pg-core via importOriginal, mirroring connection-manager.test.ts)
// so the exact rendered SQL text and bound params can be asserted with
// `PgDialect().sqlToQuery` — the same technique as timescale.test.ts.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
}))

vi.mock("../src/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/client")>()
  return {
    ...actual,
    db: { execute: mocks.execute },
  }
})

const {
  DEFAULT_PURGE_MAX_CHUNKS,
  listPurgeableBroadcasts,
  purgeBroadcastRecipients,
  hasBroadcastRecipients,
  hardDeleteBroadcast,
} = await import("../src/repositories/broadcast-purge")

const dialect = new PgDialect()

function renderQuery(sqlArg: unknown): { text: string; params: unknown[] } {
  const { sql: text, params } = dialect.sqlToQuery(sqlArg as never)
  return { text: text.replace(/\s+/g, " ").trim(), params }
}

function fullChunk(count: number, offset = 0) {
  return {
    rows: Array.from({ length: count }, (_, i) => ({
      contactId: `c-${i + offset}`,
    })),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("listPurgeableBroadcasts", () => {
  test("selects soft-deleted, non-sending broadcasts ordered oldest-deleted-first, bound limit", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ id: "b-1" }] })

    const result = await listPurgeableBroadcasts(50)

    expect(result).toEqual([{ id: "b-1" }])
    const { text, params } = renderQuery(mocks.execute.mock.calls[0]?.[0])
    expect(text).toBe(
      'SELECT "id" FROM "Broadcast" WHERE "deletedAt" IS NOT NULL AND "status" <> \'sending\' ORDER BY "deletedAt" ASC, "id" ASC LIMIT $1',
    )
    expect(params).toEqual([50])
  })
})

describe("purgeBroadcastRecipients", () => {
  test("issues a composite-key SKIP LOCKED chunk delete with bound broadcastId/chunkSize", async () => {
    // 1 row < chunkSize(500) => drained after a single chunk.
    mocks.execute.mockResolvedValueOnce(fullChunk(1))

    await purgeBroadcastRecipients({
      broadcastId: "b-1",
      chunkSize: 500,
      interChunkDelayMs: 10,
      maxRunDurationMs: 60_000,
    })

    const { text, params } = renderQuery(mocks.execute.mock.calls[0]?.[0])
    expect(text).toBe(
      'DELETE FROM "ContactOnBroadcast" WHERE ("broadcastId", "contactId") IN ( SELECT "broadcastId", "contactId" FROM "ContactOnBroadcast" WHERE "broadcastId" = $1 ORDER BY "contactId" ASC LIMIT $2 FOR UPDATE SKIP LOCKED ) RETURNING "contactId"',
    )
    expect(params).toEqual(["b-1", 500])
  })

  test("loops chunk-by-chunk and stops with 'drained' once a chunk returns fewer rows than chunkSize", async () => {
    mocks.execute
      .mockResolvedValueOnce(fullChunk(3, 0))
      .mockResolvedValueOnce(fullChunk(3, 3))
      .mockResolvedValueOnce(fullChunk(1, 6)) // short: 1 < chunkSize(3)

    const result = await purgeBroadcastRecipients({
      broadcastId: "b-1",
      chunkSize: 3,
      interChunkDelayMs: 0,
      maxRunDurationMs: 60_000,
    })

    expect(result).toEqual({ deleted: 7, stopReason: "drained" })
    expect(mocks.execute).toHaveBeenCalledTimes(3)
  })

  test("checks the deadline BEFORE starting a chunk, so a chunk never starts once the budget is spent", async () => {
    const start = 1_000_000
    const nowSpy = vi.spyOn(Date, "now")
    // Call 1: deadline computation. Calls 2-3: the pre-chunk check for chunks
    // 1 and 2, still within budget. Call 4+: the pre-chunk check for what
    // would be chunk 3 — already past budget, so that chunk must never start.
    nowSpy
      .mockReturnValueOnce(start)
      .mockReturnValueOnce(start)
      .mockReturnValueOnce(start)
      .mockReturnValue(start + 1000)

    mocks.execute.mockResolvedValue(fullChunk(3)) // always a full chunk

    const result = await purgeBroadcastRecipients({
      broadcastId: "b-1",
      chunkSize: 3,
      interChunkDelayMs: 0,
      maxRunDurationMs: 100,
    })

    // Only the 2 chunks whose pre-check ran inside the budget executed; the
    // 3rd never started (this discriminates a check-before-start fix from a
    // check-after-finish bug, which would have let a 3rd chunk run and
    // report deleted: 9).
    expect(result).toEqual({ deleted: 6, stopReason: "deadline" })
    expect(mocks.execute).toHaveBeenCalledTimes(2)

    nowSpy.mockRestore()
  })

  test("honors a caller-provided maxChunks override as the safety cap", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000) // deadline never trips
    mocks.execute.mockResolvedValue(fullChunk(3)) // always a full chunk

    const result = await purgeBroadcastRecipients({
      broadcastId: "b-1",
      chunkSize: 3,
      interChunkDelayMs: 0,
      maxRunDurationMs: 60_000,
      maxChunks: 2,
    })

    expect(result).toEqual({ deleted: 6, stopReason: "chunkCap" })
    expect(mocks.execute).toHaveBeenCalledTimes(2)

    vi.restoreAllMocks()
  })

  test("exports DEFAULT_PURGE_MAX_CHUNKS (5000) and applies it as the cap when maxChunks is omitted", async () => {
    expect(DEFAULT_PURGE_MAX_CHUNKS).toBe(5000)

    // Omitting maxChunks must default it rather than leave it `undefined` —
    // the loop guard `chunk < maxChunks` would otherwise be false on the very
    // first iteration (`0 < undefined` is false) and no chunk would ever run.
    mocks.execute.mockResolvedValueOnce(fullChunk(1)) // short chunk => drained

    const result = await purgeBroadcastRecipients({
      broadcastId: "b-1",
      chunkSize: 3,
      interChunkDelayMs: 0,
      maxRunDurationMs: 60_000,
    })

    expect(result).toEqual({ deleted: 1, stopReason: "drained" })
    expect(mocks.execute).toHaveBeenCalledTimes(1)
  })
})

describe("hasBroadcastRecipients", () => {
  test("issues an EXISTS-style probe bound to broadcastId, capped at 1 row", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ "?column?": 1 }] })

    const result = await hasBroadcastRecipients("b-1")

    expect(result).toBe(true)
    const { text, params } = renderQuery(mocks.execute.mock.calls[0]?.[0])
    expect(text).toBe(
      'SELECT 1 FROM "ContactOnBroadcast" WHERE "broadcastId" = $1 LIMIT 1',
    )
    expect(params).toEqual(["b-1"])
  })

  test("returns false when no recipient rows remain", async () => {
    mocks.execute.mockResolvedValue({ rows: [] })

    await expect(hasBroadcastRecipients("b-1")).resolves.toBe(false)
  })
})

describe("hardDeleteBroadcast", () => {
  test("pins the delete to deletedAt IS NOT NULL AND status <> 'sending', bound broadcastId", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ id: "b-1" }] })

    const result = await hardDeleteBroadcast("b-1")

    expect(result).toBe(true)
    const { text, params } = renderQuery(mocks.execute.mock.calls[0]?.[0])
    expect(text).toBe(
      'DELETE FROM "Broadcast" WHERE "id" = $1 AND "deletedAt" IS NOT NULL AND "status" <> \'sending\' RETURNING "id"',
    )
    expect(params).toEqual(["b-1"])
  })

  test("returns false when nothing matched (already undeleted, or now sending)", async () => {
    mocks.execute.mockResolvedValue({ rows: [] })

    await expect(hardDeleteBroadcast("b-1")).resolves.toBe(false)
  })
})
