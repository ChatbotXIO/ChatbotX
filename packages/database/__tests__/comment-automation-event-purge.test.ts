import { PgDialect } from "drizzle-orm/pg-core"
import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// comment-automation-event purge repository. Mocks only `db.execute` (real
// `sql` template tag via importOriginal, like broadcast-purge.test.ts) so the
// rendered SQL text and bound params can be asserted with
// `PgDialect().sqlToQuery`.
//
// What is pinned here is the retention SCOPE. Retention on this table is per
// OUTCOME: a successful reply is the analytics page's history and is kept for
// the life of the automation, so the dashboard's date filter is unbounded —
// only `status = 'failed'` rows age out, matching `ErrorLog`'s window. Drop the
// status predicate and the replies chart silently starts losing its oldest
// months while the filter still offers them.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({ execute: vi.fn() }))

vi.mock("../src/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/client")>()
  return { ...actual, db: { execute: mocks.execute } }
})

const { purgeFailedCommentAutomationEvents } = await import(
  "../src/repositories/comment-automation-event/repository"
)

const dialect = new PgDialect()

function renderQuery(sqlArg: unknown): { text: string; params: unknown[] } {
  const { sql: text, params } = dialect.sqlToQuery(sqlArg as never)
  return { text: text.replace(/\s+/g, " ").trim(), params }
}

const OPTIONS = {
  retentionDays: 30,
  chunkSize: 1000,
  interChunkDelayMs: 0,
  maxChunks: 10,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("purgeFailedCommentAutomationEvents", () => {
  test("deletes only failed rows past the retention window", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ id: "e-1" }] })

    const result = await purgeFailedCommentAutomationEvents(OPTIONS)

    expect(result).toEqual({ deleted: 1, stopReason: "drained" })
    const { text, params } = renderQuery(mocks.execute.mock.calls[0]?.[0])
    expect(text).toContain(`"status" = 'failed'`)
    expect(text).toContain(
      `"createdAt" < NOW() - make_interval(days => $1)`.replace(/\s+/g, " "),
    )
    expect(params).toEqual([30, 1000])
  })

  test("takes the oldest failed rows first, skipping locked ones", async () => {
    mocks.execute.mockResolvedValue({ rows: [] })

    await purgeFailedCommentAutomationEvents(OPTIONS)

    const { text } = renderQuery(mocks.execute.mock.calls[0]?.[0])
    expect(text).toContain('ORDER BY "createdAt" ASC')
    expect(text).toContain("FOR UPDATE SKIP LOCKED")
  })

  test("keeps chunking while a full chunk comes back", async () => {
    const fullChunk = {
      rows: Array.from({ length: 1000 }, (_, i) => ({ id: `e-${i}` })),
    }
    mocks.execute.mockResolvedValueOnce(fullChunk).mockResolvedValueOnce({
      rows: [{ id: "e-last" }],
    })

    const result = await purgeFailedCommentAutomationEvents(OPTIONS)

    expect(mocks.execute).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ deleted: 1001, stopReason: "drained" })
  })
})
