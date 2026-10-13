// @vitest-environment node

import { PgDialect } from "drizzle-orm/pg-core"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const rows: { current: unknown[] } = { current: [] }
  const chain: Record<string, ReturnType<typeof vi.fn>> & {
    then: (resolve: (value: unknown[]) => unknown) => Promise<unknown>
  } = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable query chain
    then: (resolve) => Promise.resolve(rows.current).then(resolve),
  } as never
  for (const method of [
    "select",
    "from",
    "where",
    "orderBy",
    "limit",
    "for",
    "groupBy",
    "having",
    "leftJoin",
    "insert",
    "values",
    "onConflictDoNothing",
    "update",
    "set",
    "returning",
  ]) {
    chain[method] = vi.fn(() => chain)
  }
  return { chain, rows, execute: vi.fn(), count: vi.fn() }
})

const tx = {
  select: mocks.chain.select,
  insert: mocks.chain.insert,
  update: mocks.chain.update,
  execute: mocks.execute,
  $count: mocks.count,
} as never

vi.mock("../src/client", () => ({
  db: tx,
}))

const { broadcastRecurrenceRepository: repo } = await import(
  "../src/repositories/broadcast/recurrence-repository"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rows.current = []
})

describe("broadcastRecurrenceRepository", () => {
  test("selectDbNow reads the database clock", async () => {
    mocks.execute.mockResolvedValue({
      rows: [{ now: "2026-10-13T05:00:00.000Z" }],
    })
    expect((await repo.selectDbNow(tx)).toISOString()).toBe(
      "2026-10-13T05:00:00.000Z",
    )
  })

  test("listDue returns due series oldest first and ignores a row without nextRunAt", async () => {
    const due = new Date("2026-10-13T02:00:00.000Z")
    mocks.rows.current = [
      { id: "r1", workspaceId: "w1", nextRunAt: due },
      { id: "r2", workspaceId: "w1", nextRunAt: null },
    ]
    const result = await repo.listDue({ limit: 5000 }, tx)
    expect(result).toEqual([{ id: "r1", workspaceId: "w1", nextRunAt: due }])
    expect(mocks.chain.limit).toHaveBeenCalledWith(5000)
    expect(mocks.chain.orderBy).toHaveBeenCalledTimes(1)
    expect(mocks.chain.orderBy.mock.calls[0]).toHaveLength(2) // (nextRunAt, id)
  })

  test("lockForWrite does nothing for an empty id list and locks FOR UPDATE otherwise", async () => {
    expect(await repo.lockForWrite(tx, { broadcastIds: [] })).toEqual([])
    expect(mocks.chain.select).not.toHaveBeenCalled()

    mocks.rows.current = [{ id: "r1" }]
    await repo.lockForWrite(tx, { broadcastIds: ["b1", "b2"] })
    expect(mocks.chain.for).toHaveBeenCalledWith("update")
    expect(mocks.chain.orderBy).toHaveBeenCalledTimes(1)
  })

  test("update reports whether the compare-and-set matched a row", async () => {
    mocks.rows.current = [{ id: "r1" }]
    expect(
      await repo.update(tx, {
        id: "r1",
        patch: { nextRunAt: null },
        expectedNextRunAt: new Date("2026-10-13T02:00:00.000Z"),
      }),
    ).toBe(true)

    mocks.rows.current = []
    expect(
      await repo.update(tx, {
        id: "r1",
        patch: { nextRunAt: null },
        expectedNextRunAt: new Date("2026-10-13T02:00:00.000Z"),
      }),
    ).toBe(false)
  })

  test("findForMaterialize only finds a series of the workspace the job was enqueued for", async () => {
    mocks.rows.current = []
    expect(
      await repo.findForMaterialize(tx, {
        recurrenceId: "r1",
        workspaceId: "w-other",
      }),
    ).toBeNull()

    const condition = mocks.chain.where.mock.calls[0][0]
    const query = new PgDialect().sqlToQuery(condition)
    expect(query.sql).toContain('"workspaceId"')
    expect(query.params).toEqual(["r1", "w-other"])
  })

  test("insertLedgerRows is idempotent on (recurrenceId, localSlot, occurrenceAt) and skips an empty batch", async () => {
    await repo.insertLedgerRows(tx, [])
    expect(mocks.chain.insert).not.toHaveBeenCalled()

    await repo.insertLedgerRows(tx, [
      {
        workspaceId: "w1",
        recurrenceId: "r1",
        localSlot: "2026-10-13 09:00",
        occurrenceAt: new Date("2026-10-13T02:00:00.000Z"),
        outcome: "created",
        reason: null,
        childBroadcastId: "b1",
        materializedAt: new Date("2026-10-13T02:00:05.000Z"),
      },
    ])
    expect(mocks.chain.onConflictDoNothing).toHaveBeenCalledTimes(1)
    const { target } = mocks.chain.onConflictDoNothing.mock.calls[0][0] as {
      target: unknown[]
    }
    // The instant is in the key: after a timezone edit the same wall-clock
    // text can name a different instant, which must not drop its decision.
    expect(target).toHaveLength(3)
  })

  test("grouped bucket queries group by ordinal, never by the parameterised bucket expression", async () => {
    const dialect = new PgDialect()
    const render = (fragment: unknown) =>
      dialect.sqlToQuery(fragment as never).sql

    mocks.rows.current = []
    await repo.listLedgerBucketKeys(
      {
        recurrenceId: "r1",
        granularity: "day",
        timezone: "UTC",
        limit: 31,
        cursor: "2026-10-10",
      },
      tx,
    )
    expect(render(mocks.chain.groupBy.mock.calls[0][0])).toBe("1")
    expect(render(mocks.chain.orderBy.mock.calls[0][0])).toBe("1 DESC")
    // The cursor is a row filter, so it lives in WHERE, not HAVING.
    expect(mocks.chain.having).not.toHaveBeenCalled()

    vi.clearAllMocks()
    await repo.listLedgerBucketCells(
      {
        recurrenceId: "r1",
        granularity: "week",
        timezone: "UTC",
        buckets: ["2026-10-05"],
      },
      tx,
    )
    expect(render(mocks.chain.groupBy.mock.calls[0][0])).toBe("1")
  })

  test("countLedgerSlots sums superseded slots so totals agree with the bucket counts", async () => {
    mocks.rows.current = [{ slots: 603 }]
    expect(await repo.countLedgerSlots({ recurrenceId: "r1" }, tx)).toBe(603)
    mocks.rows.current = []
    expect(await repo.countLedgerSlots({ recurrenceId: "r1" }, tx)).toBe(0)
  })

  test("bucket cells query nothing when no bucket is requested", async () => {
    expect(
      await repo.listLedgerBucketCells(
        {
          recurrenceId: "r1",
          granularity: "day",
          timezone: "UTC",
          buckets: [],
        },
        tx,
      ),
    ).toEqual([])
    expect(mocks.chain.select).not.toHaveBeenCalled()
  })

  test("ledger rows carry the run each created slot produced, and null for a skipped one", async () => {
    mocks.rows.current = [
      {
        occurrence: { id: "o1", outcome: "created", childBroadcastId: "b1" },
        run: { id: "b1", status: "sent" },
      },
      {
        occurrence: { id: "o2", outcome: "missed", childBroadcastId: null },
        run: { id: null, status: null },
      },
    ]
    const rows = await repo.listLedgerRows(
      { recurrenceId: "r1", limit: 10 },
      tx,
    )
    expect(rows[0].run).toEqual({ id: "b1", status: "sent" })
    expect(rows[1].run).toBeNull()
  })
})
