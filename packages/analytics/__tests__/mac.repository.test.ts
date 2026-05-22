import type { DatabaseClient } from "@chatbotx.io/database/client"
import type { MacEventType } from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type {
  CountDelta,
  PreparedRow,
} from "../src/repositories/postgres/mac.repository"

// --- Mocks ---------------------------------------------------------------

// `sql` is a tagged-template helper; the fake builder ignores the produced
// query object, so a structural stub is enough.
const sql = (strings: TemplateStringsArray, ...values: unknown[]) => ({
  strings,
  values,
})

// Each terminal `await` on a builder chain resolves to the next queued row
// list (or `[]` when none was queued).
const resultQueue: unknown[][] = []
function queueResult(rows: unknown[]): void {
  resultQueue.push(rows)
}
function nextResult(): unknown[] {
  return resultQueue.length > 0 ? (resultQueue.shift() as unknown[]) : []
}

const CHAIN_METHODS = [
  "values",
  "onConflictDoUpdate",
  "onConflictDoNothing",
  "returning",
  "set",
  "where",
  "from",
  "innerJoin",
  "limit",
  "orderBy",
] as const

type QueryChain = Record<string, ReturnType<typeof vi.fn>> & {
  then: (onFulfilled: (rows: unknown[]) => unknown) => Promise<unknown>
}

/** A chainable, thenable stand-in for a Drizzle query builder. */
function makeChain(): QueryChain {
  const chain = {} as QueryChain
  for (const method of CHAIN_METHODS) {
    chain[method] = vi.fn(() => chain)
  }
  // biome-ignore lint/suspicious/noThenProperty: intentional thenable — the mock mimics an awaitable Drizzle query builder
  chain.then = (onFulfilled) => Promise.resolve(nextResult()).then(onFulfilled)
  return chain
}

const dbInsert = vi.fn(makeChain)
const dbUpdate = vi.fn(makeChain)
const dbSelect = vi.fn(makeChain)

vi.mock("@chatbotx.io/database/client", () => ({
  db: { insert: dbInsert, update: dbUpdate, select: dbSelect },
  sql,
  and: (...args: unknown[]) => args,
  desc: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
  gt: (...args: unknown[]) => args,
  gte: (...args: unknown[]) => args,
  lt: (...args: unknown[]) => args,
  lte: (...args: unknown[]) => args,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  billingMacModel: {},
  workspaceMacModel: {},
  contactActiveMonthlyModel: {},
}))

const { MacRepository } = await import(
  "../src/repositories/postgres/mac.repository"
)

// --- Fixtures ------------------------------------------------------------

function makeClient(): DatabaseClient {
  return {
    insert: vi.fn(makeChain),
    update: vi.fn(makeChain),
  } as unknown as DatabaseClient
}

/** All `count` operands fed into the additive `sql` increment of `.set(...)`. */
function incrementCounts(builder: ReturnType<typeof vi.fn>): unknown[] {
  return builder.mock.results.flatMap((result) => {
    const chain = result.value as QueryChain
    return chain.set.mock.calls.map((call) => {
      // `sql\`${col} + ${count}\`` → values = [column, count]; count is [1].
      const setArg = call[0] as { macCount: { values: unknown[] } }
      return setArg.macCount.values[1]
    })
  })
}

function makeRow(overrides: Partial<PreparedRow> = {}): PreparedRow {
  return {
    workspaceId: "ws-1",
    contactId: "c-1",
    contactInboxId: "ci-1",
    inboxId: "ib-1",
    eventType: 1 as MacEventType,
    occurredAt: new Date("2026-05-01T10:00:00.000Z"),
    hourBucket: new Date("2026-05-01T10:00:00.000Z"),
    periodStart: new Date("2026-04-10T09:00:00.000Z"),
    periodEnd: new Date("2026-05-10T09:00:00.000Z"),
    billingId: "bill-1",
    billingMacId: "bm-1",
    workspaceMacId: "wm-1",
    ...overrides,
  }
}

function makeDelta(overrides: Partial<CountDelta> = {}): CountDelta {
  return { id: "wm-1", count: 1, ...overrides }
}

let repo: InstanceType<typeof MacRepository>

beforeEach(() => {
  repo = new MacRepository()
  resultQueue.length = 0
  dbInsert.mockClear()
  dbUpdate.mockClear()
  dbSelect.mockClear()
})

// --- Tests ---------------------------------------------------------------

describe("MacRepository — empty-input guards", () => {
  test("upsertMonthlyPresence returns [] for an empty batch", async () => {
    const client = makeClient()
    expect(await repo.upsertMonthlyPresence([], client)).toEqual([])
    expect(client.insert).not.toHaveBeenCalled()
  })

  test("ensureBillingMac returns an empty map for no entries", async () => {
    const client = makeClient()
    expect((await repo.ensureBillingMac([], client)).size).toBe(0)
    expect(client.insert).not.toHaveBeenCalled()
  })

  test("ensureWorkspaceMac returns an empty map for no entries", async () => {
    const client = makeClient()
    expect((await repo.ensureWorkspaceMac([], client)).size).toBe(0)
    expect(client.insert).not.toHaveBeenCalled()
  })

  test("addWorkspaceMacCount returns [] for no deltas", async () => {
    const client = makeClient()
    expect(await repo.addWorkspaceMacCount([], client)).toEqual([])
    expect(client.update).not.toHaveBeenCalled()
  })

  test("addBillingMacCount returns [] for no deltas", async () => {
    const client = makeClient()
    expect(await repo.addBillingMacCount([], client)).toEqual([])
    expect(client.update).not.toHaveBeenCalled()
  })
})

describe("MacRepository — ensureBillingMac", () => {
  const periodStart = new Date("2026-04-10T09:00:00.000Z")
  const periodEnd = new Date("2026-05-10T09:00:00.000Z")

  test("a single entry issues one insert and maps the returned id", async () => {
    const client = makeClient()
    queueResult([{ id: "bm-99", billingId: "bill-1", periodStart, periodEnd }])

    const map = await repo.ensureBillingMac(
      [{ billingId: "bill-1", periodStart, periodEnd }],
      client,
    )

    expect(client.insert).toHaveBeenCalledTimes(1)
    const key = `bill-1|${periodStart.toISOString()}|${periodEnd.toISOString()}`
    expect(map.get(key)).toBe("bm-99")
    expect(map.size).toBe(1)
  })

  test("distinct entries issue one insert each and map every key", async () => {
    const client = makeClient()
    const periodEnd2 = new Date("2026-06-10T09:00:00.000Z")
    queueResult([{ id: "bm-1", billingId: "bill-1", periodStart, periodEnd }])
    queueResult([
      { id: "bm-2", billingId: "bill-2", periodStart, periodEnd: periodEnd2 },
    ])

    const map = await repo.ensureBillingMac(
      [
        { billingId: "bill-1", periodStart, periodEnd },
        { billingId: "bill-2", periodStart, periodEnd: periodEnd2 },
      ],
      client,
    )

    expect(client.insert).toHaveBeenCalledTimes(2)
    expect(
      map.get(`bill-1|${periodStart.toISOString()}|${periodEnd.toISOString()}`),
    ).toBe("bm-1")
    expect(
      map.get(
        `bill-2|${periodStart.toISOString()}|${periodEnd2.toISOString()}`,
      ),
    ).toBe("bm-2")
  })

  test("duplicate tuples both resolve to the same id for the shared key", async () => {
    const client = makeClient()
    // One insert per entry; ON CONFLICT DO UPDATE returns the same row twice.
    queueResult([{ id: "bm-7", billingId: "bill-1", periodStart, periodEnd }])
    queueResult([{ id: "bm-7", billingId: "bill-1", periodStart, periodEnd }])

    const map = await repo.ensureBillingMac(
      [
        { billingId: "bill-1", periodStart, periodEnd },
        { billingId: "bill-1", periodStart, periodEnd },
      ],
      client,
    )

    expect(client.insert).toHaveBeenCalledTimes(2)
    const key = `bill-1|${periodStart.toISOString()}|${periodEnd.toISOString()}`
    expect(map.get(key)).toBe("bm-7")
    expect(map.size).toBe(1)
  })

  test("a returned row without an id is skipped, not crashed on", async () => {
    const client = makeClient()
    queueResult([{ billingId: "bill-1", periodStart, periodEnd }])

    const map = await repo.ensureBillingMac(
      [{ billingId: "bill-1", periodStart, periodEnd }],
      client,
    )

    expect(map.size).toBe(0)
  })

  test("an empty RETURNING result adds no key", async () => {
    const client = makeClient()
    queueResult([])

    const map = await repo.ensureBillingMac(
      [{ billingId: "bill-1", periodStart, periodEnd }],
      client,
    )

    expect(map.size).toBe(0)
  })
})

describe("MacRepository — ensureWorkspaceMac", () => {
  test("a single entry maps the returned id", async () => {
    const client = makeClient()
    queueResult([{ id: "wm-99", workspaceId: "ws-1", billingMacId: "bm-1" }])

    const map = await repo.ensureWorkspaceMac(
      [{ workspaceId: "ws-1", billingMacId: "bm-1" }],
      client,
    )

    expect(client.insert).toHaveBeenCalledTimes(1)
    expect(map.get("ws-1|bm-1")).toBe("wm-99")
  })

  test("distinct entries issue one insert each and map every key", async () => {
    const client = makeClient()
    queueResult([{ id: "wm-1", workspaceId: "ws-1", billingMacId: "bm-1" }])
    queueResult([{ id: "wm-2", workspaceId: "ws-2", billingMacId: "bm-1" }])

    const map = await repo.ensureWorkspaceMac(
      [
        { workspaceId: "ws-1", billingMacId: "bm-1" },
        { workspaceId: "ws-2", billingMacId: "bm-1" },
      ],
      client,
    )

    expect(client.insert).toHaveBeenCalledTimes(2)
    expect(map.get("ws-1|bm-1")).toBe("wm-1")
    expect(map.get("ws-2|bm-1")).toBe("wm-2")
  })

  test("duplicate pairs both resolve to the same id", async () => {
    const client = makeClient()
    queueResult([{ id: "wm-5", workspaceId: "ws-1", billingMacId: "bm-1" }])
    queueResult([{ id: "wm-5", workspaceId: "ws-1", billingMacId: "bm-1" }])

    const map = await repo.ensureWorkspaceMac(
      [
        { workspaceId: "ws-1", billingMacId: "bm-1" },
        { workspaceId: "ws-1", billingMacId: "bm-1" },
      ],
      client,
    )

    expect(client.insert).toHaveBeenCalledTimes(2)
    expect(map.get("ws-1|bm-1")).toBe("wm-5")
    expect(map.size).toBe(1)
  })

  test("a returned row without an id is skipped", async () => {
    const client = makeClient()
    queueResult([{ workspaceId: "ws-1", billingMacId: "bm-1" }])

    const map = await repo.ensureWorkspaceMac(
      [{ workspaceId: "ws-1", billingMacId: "bm-1" }],
      client,
    )

    expect(map.size).toBe(0)
  })
})

describe("MacRepository — upsertMonthlyPresence", () => {
  test("groups new-contact counts for one workspaceMacId", async () => {
    const client = makeClient()
    queueResult([{ workspaceMacId: "wm-1" }, { workspaceMacId: "wm-1" }])

    const deltas = await repo.upsertMonthlyPresence([makeRow()], client)

    expect(deltas).toEqual([{ workspaceMacId: "wm-1", count: 2 }])
  })

  test("tallies counts independently across workspaceMacIds", async () => {
    const client = makeClient()
    queueResult([
      { workspaceMacId: "wm-1" },
      { workspaceMacId: "wm-2" },
      { workspaceMacId: "wm-1" },
    ])

    const deltas = await repo.upsertMonthlyPresence([makeRow()], client)

    expect(deltas).toContainEqual({ workspaceMacId: "wm-1", count: 2 })
    expect(deltas).toContainEqual({ workspaceMacId: "wm-2", count: 1 })
  })

  test("returns [] when every row conflicted (empty RETURNING)", async () => {
    const client = makeClient()
    queueResult([])

    const deltas = await repo.upsertMonthlyPresence([makeRow()], client)

    expect(deltas).toEqual([])
  })
})

describe("MacRepository — addWorkspaceMacCount", () => {
  test("a single delta issues one update and coerces macCount", async () => {
    const client = makeClient()
    queueResult([{ id: "wm-1", macCount: "5" }])

    const rows = await repo.addWorkspaceMacCount(
      [makeDelta({ count: 5 })],
      client,
    )

    expect(client.update).toHaveBeenCalledTimes(1)
    expect(incrementCounts(client.update as ReturnType<typeof vi.fn>)).toEqual([
      5,
    ])
    expect(rows).toEqual([{ workspaceMacId: "wm-1", macCount: 5 }])
  })

  test("two same-id deltas issue two additive updates", async () => {
    const client = makeClient()
    queueResult([{ id: "wm-1", macCount: "2" }])
    queueResult([{ id: "wm-1", macCount: "5" }])

    const rows = await repo.addWorkspaceMacCount(
      [makeDelta({ count: 2 }), makeDelta({ count: 3 })],
      client,
    )

    // Two updates — the DB adds 2 then 3, so both operands must reach `set()`.
    expect(client.update).toHaveBeenCalledTimes(2)
    expect(incrementCounts(client.update as ReturnType<typeof vi.fn>)).toEqual([
      2, 3,
    ])
    expect(rows.map((row) => row.macCount)).toEqual([2, 5])
  })

  test("distinct ids each get their own update", async () => {
    const client = makeClient()
    queueResult([{ id: "wm-1", macCount: 1 }])
    queueResult([{ id: "wm-2", macCount: 1 }])

    const rows = await repo.addWorkspaceMacCount(
      [makeDelta({ id: "wm-1" }), makeDelta({ id: "wm-2" })],
      client,
    )

    expect(client.update).toHaveBeenCalledTimes(2)
    expect(rows.map((row) => row.workspaceMacId)).toEqual(["wm-1", "wm-2"])
  })

  test("a zero-count delta still issues an update", async () => {
    const client = makeClient()
    queueResult([{ id: "wm-1", macCount: 0 }])

    await repo.addWorkspaceMacCount([makeDelta({ count: 0 })], client)

    expect(client.update).toHaveBeenCalledTimes(1)
    expect(incrementCounts(client.update as ReturnType<typeof vi.fn>)).toEqual([
      0,
    ])
  })

  test("a delta whose update returns no row is skipped, not crashed on", async () => {
    const client = makeClient()
    queueResult([])
    queueResult([{ id: "wm-2", macCount: 4 }])

    const rows = await repo.addWorkspaceMacCount(
      [makeDelta({ id: "wm-missing" }), makeDelta({ id: "wm-2", count: 4 })],
      client,
    )

    expect(client.update).toHaveBeenCalledTimes(2)
    expect(rows).toEqual([{ workspaceMacId: "wm-2", macCount: 4 }])
  })
})

describe("MacRepository — addBillingMacCount", () => {
  test("a single delta issues one update and coerces macCount", async () => {
    const client = makeClient()
    queueResult([{ id: "bm-1", macCount: "8" }])

    const rows = await repo.addBillingMacCount(
      [makeDelta({ id: "bm-1", count: 8 })],
      client,
    )

    expect(client.update).toHaveBeenCalledTimes(1)
    expect(rows).toEqual([{ billingMacId: "bm-1", macCount: 8 }])
  })

  test("two same-id deltas issue two additive updates", async () => {
    const client = makeClient()
    queueResult([{ id: "bm-1", macCount: "4" }])
    queueResult([{ id: "bm-1", macCount: "8" }])

    const rows = await repo.addBillingMacCount(
      [
        makeDelta({ id: "bm-1", count: 4 }),
        makeDelta({ id: "bm-1", count: 4 }),
      ],
      client,
    )

    expect(client.update).toHaveBeenCalledTimes(2)
    expect(incrementCounts(client.update as ReturnType<typeof vi.fn>)).toEqual([
      4, 4,
    ])
    expect(rows.map((row) => row.macCount)).toEqual([4, 8])
  })

  test("distinct ids each get their own update", async () => {
    const client = makeClient()
    queueResult([{ id: "bm-1", macCount: 1 }])
    queueResult([{ id: "bm-2", macCount: 1 }])

    const rows = await repo.addBillingMacCount(
      [makeDelta({ id: "bm-1" }), makeDelta({ id: "bm-2" })],
      client,
    )

    expect(client.update).toHaveBeenCalledTimes(2)
    expect(rows.map((row) => row.billingMacId)).toEqual(["bm-1", "bm-2"])
  })

  test("a delta whose update returns no row is skipped", async () => {
    const client = makeClient()
    queueResult([])

    const rows = await repo.addBillingMacCount(
      [makeDelta({ id: "bm-missing" })],
      client,
    )

    expect(client.update).toHaveBeenCalledTimes(1)
    expect(rows).toEqual([])
  })
})

describe("MacRepository — reconcilePeriod", () => {
  test("rebuilds WorkspaceMac then re-sums BillingMac from its children", async () => {
    queueResult([]) // WorkspaceMac UPDATE RETURNING
    queueResult([{ billingMacId: "bm-1" }]) // target BillingMac lookup
    queueResult([]) // BillingMac UPDATE RETURNING

    await repo.reconcilePeriod({
      workspaceId: "ws-1",
      periodStart: "2026-05-01T00:00:00.000Z",
    })

    // Two UPDATEs: WorkspaceMac.macCount, then the rolled-up BillingMac.macCount.
    expect(dbUpdate).toHaveBeenCalledTimes(2)
    // Three SELECTs: the active-contact count subquery, the target lookup, and
    // the BillingMac re-sum subquery.
    expect(dbSelect).toHaveBeenCalledTimes(3)
  })

  test("skips the BillingMac re-sum when no target row resolves", async () => {
    queueResult([]) // WorkspaceMac UPDATE RETURNING
    queueResult([]) // target lookup — no row

    await repo.reconcilePeriod({
      workspaceId: "ws-1",
      periodStart: "2026-05-01T00:00:00.000Z",
    })

    // Only the WorkspaceMac UPDATE ran; the BillingMac UPDATE was skipped.
    expect(dbUpdate).toHaveBeenCalledTimes(1)
  })
})

describe("MacRepository — getActiveContactCountByWorkspaceId", () => {
  test("returns macCount and ISO period bounds from the joined row", async () => {
    queueResult([
      {
        periodStart: "2026-05-01T00:00:00.000Z",
        periodEnd: "2026-06-01T00:00:00.000Z",
        macCount: "12",
      },
    ])

    const result = await repo.getActiveContactCountByWorkspaceId({
      workspaceId: "ws-1",
    })

    expect(result.macCount).toBe(12)
    expect(result.periodStart).toBe("2026-05-01T00:00:00.000Z")
    expect(result.periodEnd).toBe("2026-06-01T00:00:00.000Z")
  })

  test("returns a zero count with no period when no active row exists", async () => {
    queueResult([])

    const result = await repo.getActiveContactCountByWorkspaceId({
      workspaceId: "ws-1",
    })

    expect(result.macCount).toBe(0)
    expect(result.periodStart).toBeUndefined()
    expect(result.periodEnd).toBeNull()
  })
})

describe("MacRepository — getActiveContactCountByBillingId", () => {
  test("returns macCount and period bounds from the BillingMac row", async () => {
    queueResult([
      {
        periodStart: new Date("2026-05-01T00:00:00.000Z"),
        periodEnd: new Date("2026-06-01T00:00:00.000Z"),
        macCount: 7,
      },
    ])

    const result = await repo.getActiveContactCountByBillingId({
      billingId: "bill-1",
    })

    expect(result.macCount).toBe(7)
    expect(result.periodStart).toBe("2026-05-01T00:00:00.000Z")
    expect(result.periodEnd).toBe("2026-06-01T00:00:00.000Z")
  })

  test("coerces a text-string macCount to a number", async () => {
    queueResult([
      {
        periodStart: "2026-05-01T00:00:00.000Z",
        periodEnd: "2026-06-01T00:00:00.000Z",
        macCount: "42",
      },
    ])

    const result = await repo.getActiveContactCountByBillingId({
      billingId: "bill-1",
    })

    expect(result.macCount).toBe(42)
  })

  test("returns a zero count when the billing has no current period", async () => {
    queueResult([])

    const result = await repo.getActiveContactCountByBillingId({
      billingId: "bill-1",
    })

    expect(result.macCount).toBe(0)
    expect(result.periodStart).toBeUndefined()
    expect(result.periodEnd).toBeNull()
  })
})
