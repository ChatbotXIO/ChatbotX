import { DrizzleQueryError } from "drizzle-orm"
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
  setLocalStatementTimeout: vi.fn(),
  deleteSourceBatch: vi.fn(),
  existsForSource: vi.fn(),
}))

vi.mock("../src/repositories/contact-info-capture", () => ({
  contactInfoCaptureRepository: {
    deleteSourceBatch: mocks.deleteSourceBatch,
    existsForSource: mocks.existsForSource,
  },
}))

vi.mock("../src/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/client")>()
  return {
    ...actual,
    db: {
      execute: mocks.execute,
      // Each chunk runs in its own short transaction; the tx executes through
      // the same mock so the rendered DELETE is asserted as before.
      transaction: (run: (tx: unknown) => Promise<unknown>) =>
        run({ execute: mocks.execute }),
    },
    setLocalStatementTimeout: mocks.setLocalStatementTimeout,
  }
})

const {
  DEFAULT_PURGE_MAX_CHUNKS,
  listPurgeableBroadcasts,
  purgeBroadcastCaptures,
  purgeBroadcastRecipients,
  hasBroadcastRecipients,
  hardDeleteBroadcast,
} = await import("../src/repositories/broadcast-purge")

const dialect = new PgDialect()
const MILLISECONDS_LITERAL = /^\d+ms$/

function renderQuery(sqlArg: unknown): { text: string; params: unknown[] } {
  const { sql: text, params } = dialect.sqlToQuery(sqlArg as never)
  return { text: text.replace(/\s+/g, " ").trim(), params }
}

function fullChunk(count: number) {
  return { rowCount: count }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("listPurgeableBroadcasts", () => {
  test("selects soft-deleted, non-sending broadcasts ordered oldest-deleted-first, bound limit", async () => {
    mocks.execute.mockResolvedValue({
      rows: [{ id: "b-1", workspaceId: "w-1" }],
    })

    const result = await listPurgeableBroadcasts(50)

    expect(result).toEqual([{ id: "b-1", workspaceId: "w-1" }])
    const { text, params } = renderQuery(mocks.execute.mock.calls[0]?.[0])
    expect(text).toBe(
      'SELECT "id", "workspaceId" FROM "Broadcast" WHERE "deletedAt" IS NOT NULL AND "status" <> \'sending\' ORDER BY "deletedAt" ASC, "id" ASC LIMIT $1',
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
      'DELETE FROM "ContactOnBroadcast" WHERE ("broadcastId", "contactId") IN ( SELECT "broadcastId", "contactId" FROM "ContactOnBroadcast" WHERE "broadcastId" = $1 ORDER BY "contactId" ASC LIMIT $2 FOR UPDATE SKIP LOCKED )',
    )
    expect(params).toEqual(["b-1", 500])
  })

  // A background draft cleanup must never delete the fresh audience of a
  // broadcast that was re-scheduled meanwhile, so every chunk re-checks that
  // the broadcast is still a draft in the same statement.
  test("with onlyWhileDraft, deletes a chunk only while the broadcast is still a draft", async () => {
    mocks.execute.mockResolvedValueOnce(fullChunk(1))

    await purgeBroadcastRecipients({
      broadcastId: "b-1",
      chunkSize: 500,
      interChunkDelayMs: 10,
      maxRunDurationMs: 60_000,
      onlyWhileDraft: true,
    })

    const { text, params } = renderQuery(mocks.execute.mock.calls[0]?.[0])
    expect(text).toBe(
      'DELETE FROM "ContactOnBroadcast" WHERE ("broadcastId", "contactId") IN ( SELECT "broadcastId", "contactId" FROM "ContactOnBroadcast" WHERE "broadcastId" = $1 AND EXISTS ( SELECT 1 FROM "Broadcast" WHERE "id" = $2 AND "status" = \'draft\' ) ORDER BY "contactId" ASC LIMIT $3 FOR UPDATE SKIP LOCKED )',
    )
    expect(params).toEqual(["b-1", "b-1", 500])
  })

  // A DELETE waiting on a table lock (e.g. during a migration) must not hold
  // the caller's worker slot past its budget: every chunk is capped at the
  // time left, and a cancelled chunk ends the run as "deadline".
  test("caps each chunk at the time left in the run", async () => {
    mocks.execute.mockResolvedValueOnce(fullChunk(1))

    await purgeBroadcastRecipients({
      broadcastId: "b-1",
      chunkSize: 500,
      interChunkDelayMs: 10,
      maxRunDurationMs: 60_000,
    })

    const [, timeout] = mocks.setLocalStatementTimeout.mock.calls[0] as [
      unknown,
      string,
    ]
    expect(timeout).toMatch(MILLISECONDS_LITERAL)
    const ms = Number.parseInt(timeout, 10)
    expect(ms).toBeGreaterThan(0)
    expect(ms).toBeLessThanOrEqual(60_000)
  })

  test("ends the run as 'deadline', keeping what was deleted, when a chunk times out", async () => {
    const timeout = new DrizzleQueryError(
      "DELETE",
      [],
      Object.assign(new Error("canceling statement due to statement timeout"), {
        code: "57014",
      }),
    )
    mocks.execute
      .mockResolvedValueOnce(fullChunk(3))
      .mockRejectedValueOnce(timeout)

    const result = await purgeBroadcastRecipients({
      broadcastId: "b-1",
      chunkSize: 3,
      interChunkDelayMs: 0,
      maxRunDurationMs: 60_000,
    })

    expect(result).toEqual({ deleted: 3, stopReason: "deadline" })
  })

  test("propagates any other database error", async () => {
    mocks.execute.mockRejectedValueOnce(new Error("connection lost"))

    await expect(
      purgeBroadcastRecipients({
        broadcastId: "b-1",
        chunkSize: 3,
        interChunkDelayMs: 0,
        maxRunDurationMs: 60_000,
      }),
    ).rejects.toThrow("connection lost")
  })

  test("loops chunk-by-chunk and stops with 'drained' once a chunk returns fewer rows than chunkSize", async () => {
    mocks.execute
      .mockResolvedValueOnce(fullChunk(3))
      .mockResolvedValueOnce(fullChunk(3))
      .mockResolvedValueOnce(fullChunk(1)) // short: 1 < chunkSize(3)

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

describe("purgeBroadcastCaptures", () => {
  const input = {
    broadcastId: "b-1",
    workspaceId: "w-1",
    chunkSize: 500,
    interChunkDelayMs: 0,
    maxRunDurationMs: 60_000,
  }

  test("deletes source batches in transactions and reports drained on a short chunk", async () => {
    mocks.deleteSourceBatch.mockResolvedValueOnce(500).mockResolvedValueOnce(7)

    const result = await purgeBroadcastCaptures(input)

    expect(result).toEqual({ deleted: 507, stopReason: "drained" })
    expect(mocks.deleteSourceBatch).toHaveBeenCalledTimes(2)
    expect(mocks.deleteSourceBatch).toHaveBeenCalledWith(
      {
        workspaceId: "w-1",
        sourceType: "broadcast",
        sourceId: "b-1",
        limit: 500,
        extraWhere: undefined,
      },
      expect.anything(),
    )
    expect(mocks.setLocalStatementTimeout).toHaveBeenCalledTimes(2)
  })

  test("onlyWhileDraft passes the draft guard to every chunk", async () => {
    mocks.deleteSourceBatch.mockResolvedValueOnce(0)

    await purgeBroadcastCaptures({ ...input, onlyWhileDraft: true })

    expect(mocks.deleteSourceBatch).toHaveBeenCalledWith(
      expect.objectContaining({ extraWhere: expect.anything() }),
      expect.anything(),
    )
  })

  test("stops on the deadline before starting a chunk when the budget is spent", async () => {
    const result = await purgeBroadcastCaptures({
      ...input,
      maxRunDurationMs: 0,
    })

    expect(result).toEqual({ deleted: 0, stopReason: "deadline" })
    expect(mocks.deleteSourceBatch).not.toHaveBeenCalled()
  })

  test("stops on the chunk cap when every chunk is full", async () => {
    mocks.deleteSourceBatch.mockResolvedValue(500)

    const result = await purgeBroadcastCaptures({ ...input, maxChunks: 3 })

    expect(result).toEqual({ deleted: 1500, stopReason: "chunkCap" })
  })

  test("a statement timeout ends the run as a deadline, keeping what was deleted", async () => {
    const timeout = new DrizzleQueryError(
      "DELETE",
      [],
      Object.assign(new Error("canceling statement due to statement timeout"), {
        code: "57014",
      }),
    )
    mocks.deleteSourceBatch
      .mockResolvedValueOnce(500)
      .mockRejectedValueOnce(timeout)

    const result = await purgeBroadcastCaptures(input)

    expect(result).toEqual({ deleted: 500, stopReason: "deadline" })
  })

  test("propagates any other database error", async () => {
    mocks.deleteSourceBatch.mockRejectedValueOnce(new Error("db down"))

    await expect(purgeBroadcastCaptures(input)).rejects.toThrow("db down")
  })
})

describe("hardDeleteBroadcast", () => {
  const args = { broadcastId: "b-1", workspaceId: "w-1" }

  test("locks the row FOR UPDATE, re-checks captures, then deletes pinned to deletedAt/status", async () => {
    mocks.execute
      .mockResolvedValueOnce({ rows: [{ id: "b-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "b-1" }] })
    mocks.existsForSource.mockResolvedValue(false)

    const result = await hardDeleteBroadcast(args)

    expect(result).toBe(true)
    const lock = renderQuery(mocks.execute.mock.calls[0]?.[0])
    expect(lock.text).toBe(
      'SELECT "id" FROM "Broadcast" WHERE "id" = $1 AND "workspaceId" = $2::bigint AND "deletedAt" IS NOT NULL AND "status" <> \'sending\' FOR UPDATE',
    )
    expect(lock.params).toEqual(["b-1", "w-1"])
    expect(mocks.existsForSource).toHaveBeenCalledWith(
      { workspaceId: "w-1", sourceType: "broadcast", sourceId: "b-1" },
      expect.anything(),
    )
    const del = renderQuery(mocks.execute.mock.calls[1]?.[0])
    expect(del.text).toBe(
      'DELETE FROM "Broadcast" WHERE "id" = $1 AND "workspaceId" = $2::bigint AND "deletedAt" IS NOT NULL AND "status" <> \'sending\' RETURNING "id"',
    )
    expect(del.params).toEqual(["b-1", "w-1"])
  })

  test("a broadcast of another workspace is not locked, checked or deleted", async () => {
    // The lock is scoped to the workspace, so a mismatched id finds no row.
    mocks.execute.mockResolvedValue({ rows: [] })

    await expect(
      hardDeleteBroadcast({ broadcastId: "b-1", workspaceId: "w-other" }),
    ).resolves.toBe(false)

    const lock = renderQuery(mocks.execute.mock.calls[0]?.[0])
    expect(lock.params).toEqual(["b-1", "w-other"])
    expect(mocks.existsForSource).not.toHaveBeenCalled()
    expect(mocks.execute).toHaveBeenCalledTimes(1)
  })

  test("keeps the broadcast when a capture committed after the drain", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [{ id: "b-1" }] })
    mocks.existsForSource.mockResolvedValue(true)

    await expect(hardDeleteBroadcast(args)).resolves.toBe(false)
    expect(mocks.execute).toHaveBeenCalledTimes(1)
  })

  test("returns false without deleting when the lock finds nothing (undeleted, or now sending)", async () => {
    mocks.execute.mockResolvedValue({ rows: [] })

    await expect(hardDeleteBroadcast(args)).resolves.toBe(false)
    expect(mocks.existsForSource).not.toHaveBeenCalled()
    expect(mocks.execute).toHaveBeenCalledTimes(1)
  })
})
