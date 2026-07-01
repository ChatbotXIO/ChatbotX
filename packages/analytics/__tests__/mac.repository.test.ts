import type { DatabaseClient } from "@chatbotx.io/database/client"
import type { MacEventType } from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type {
  CountDelta,
  PreparedRow,
} from "../src/repositories/postgres/mac.repository"

const sql = (strings: TemplateStringsArray, ...values: unknown[]) => ({
  strings,
  values,
})

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

function makeChain(): QueryChain {
  const chain = {} as QueryChain
  for (const method of CHAIN_METHODS) {
    chain[method] = vi.fn(() => chain)
  }
  // biome-ignore lint/suspicious/noThenProperty: intentional thenable
  chain.then = (onFulfilled) => Promise.resolve(nextResult()).then(onFulfilled)
  return chain
}

const dbInsert = vi.fn(makeChain)
const dbUpdate = vi.fn(makeChain)
const dbSelect = vi.fn(makeChain)
const dbExecute = vi.fn(async () => ({ rows: [] }))
const countDistinct = vi.fn((column: unknown) => ({
  __countDistinct: true,
  column,
}))
const and = vi.fn((...args: unknown[]) => args)
const eq = vi.fn((...args: unknown[]) => ({ op: "eq", args }))
const gte = vi.fn((...args: unknown[]) => ({ op: "gte", args }))
const gt = vi.fn((...args: unknown[]) => ({ op: "gt", args }))
const lte = vi.fn((...args: unknown[]) => ({ op: "lte", args }))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    execute: dbExecute,
    insert: dbInsert,
    update: dbUpdate,
    select: dbSelect,
  },
  sql,
  and,
  count: () => ({ __count: true }),
  countDistinct,
  desc: (...args: unknown[]) => args,
  eq,
  gt,
  gte,
  lt: (...args: unknown[]) => args,
  lte,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  workspaceMacModel: {
    id: "wm.id",
    periodEnd: "wm.periodEnd",
    periodStart: "wm.periodStart",
  },
  contactActiveMonthlyModel: {
    contactId: "cam.contactId",
    periodStart: "cam.periodStart",
    workspaceMacId: "cam.workspaceMacId",
    workspaceId: "cam.workspaceId",
  },
  contactActiveHourlyModel: {
    contactId: "cah.contactId",
    contactInboxId: "cah.contactInboxId",
    hourBucket: "cah.hourBucket",
    inboxId: "cah.inboxId",
    workspaceId: "cah.workspaceId",
  },
  workspaceModel: { id: "ws.id", ownerId: "ws.ownerId" },
}))

const { MacRepository } = await import(
  "../src/repositories/postgres/mac.repository"
)

function makeClient(): DatabaseClient {
  return {
    insert: vi.fn(makeChain),
    update: vi.fn(makeChain),
  } as unknown as DatabaseClient
}

function incrementCounts(builder: ReturnType<typeof vi.fn>): unknown[] {
  return builder.mock.results.flatMap((result) => {
    const chain = result.value as QueryChain
    return chain.set.mock.calls.map((call) => {
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
  dbExecute.mockClear()
  countDistinct.mockClear()
  and.mockClear()
  eq.mockClear()
  gte.mockClear()
  gt.mockClear()
  lte.mockClear()
})

describe("MacRepository — empty-input guards", () => {
  test("upsertMonthlyPresence returns [] for an empty batch", async () => {
    const client = makeClient()
    expect(await repo.upsertMonthlyPresence([], client)).toEqual([])
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
})

describe("MacRepository — ensureWorkspaceMac", () => {
  const periodStart = new Date("2026-04-10T09:00:00.000Z")
  const periodEnd = new Date("2026-05-10T09:00:00.000Z")

  test("a single entry maps the returned id", async () => {
    const client = makeClient()
    queueResult([{ id: "wm-99", workspaceId: "ws-1", periodStart, periodEnd }])

    const map = await repo.ensureWorkspaceMac(
      [{ workspaceId: "ws-1", periodStart, periodEnd }],
      client,
    )

    expect(client.insert).toHaveBeenCalledTimes(1)
    const key = `ws-1|${periodStart.toISOString()}|${periodEnd.toISOString()}`
    expect(map.get(key)).toBe("wm-99")
    expect(map.size).toBe(1)
  })

  test("distinct entries issue one insert each and map every key", async () => {
    const client = makeClient()
    queueResult([{ id: "wm-1", workspaceId: "ws-1", periodStart, periodEnd }])
    queueResult([{ id: "wm-2", workspaceId: "ws-2", periodStart, periodEnd }])

    const map = await repo.ensureWorkspaceMac(
      [
        { workspaceId: "ws-1", periodStart, periodEnd },
        { workspaceId: "ws-2", periodStart, periodEnd },
      ],
      client,
    )

    expect(client.insert).toHaveBeenCalledTimes(2)
    expect(
      map.get(`ws-1|${periodStart.toISOString()}|${periodEnd.toISOString()}`),
    ).toBe("wm-1")
    expect(
      map.get(`ws-2|${periodStart.toISOString()}|${periodEnd.toISOString()}`),
    ).toBe("wm-2")
  })

  test("duplicate pairs both resolve to the same id", async () => {
    const client = makeClient()
    queueResult([{ id: "wm-5", workspaceId: "ws-1", periodStart, periodEnd }])
    queueResult([{ id: "wm-5", workspaceId: "ws-1", periodStart, periodEnd }])

    const map = await repo.ensureWorkspaceMac(
      [
        { workspaceId: "ws-1", periodStart, periodEnd },
        { workspaceId: "ws-1", periodStart, periodEnd },
      ],
      client,
    )

    expect(client.insert).toHaveBeenCalledTimes(2)
    expect(map.size).toBe(1)
  })

  test("a returned row without an id is skipped", async () => {
    const client = makeClient()
    queueResult([{ workspaceId: "ws-1", periodStart, periodEnd }])

    const map = await repo.ensureWorkspaceMac(
      [{ workspaceId: "ws-1", periodStart, periodEnd }],
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

describe("MacRepository — upsertHourlyPresence", () => {
  test("returns without inserting for an empty batch", async () => {
    const client = makeClient()

    await repo.upsertHourlyPresence([], client)

    expect(client.insert).not.toHaveBeenCalled()
  })

  test("inserts hourly presence rows and ignores conflicts", async () => {
    const client = makeClient()
    const rows = [
      {
        workspaceId: "ws-1",
        contactId: "c-1",
        contactInboxId: "ci-1",
        inboxId: "ib-1",
        hourBucket: new Date("2026-05-01T10:00:00.000Z"),
      },
    ]

    await repo.upsertHourlyPresence(rows, client)

    expect(client.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: "cah.contactId",
        hourBucket: "cah.hourBucket",
      }),
    )
    const chain = (client.insert as ReturnType<typeof vi.fn>).mock.results[0]
      ?.value as QueryChain
    expect(chain.values).toHaveBeenCalledWith(rows)
    expect(chain.onConflictDoNothing).toHaveBeenCalledTimes(1)
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

    expect(client.update).toHaveBeenCalledTimes(2)
    expect(incrementCounts(client.update as ReturnType<typeof vi.fn>)).toEqual([
      2, 3,
    ])
    expect(rows.map((row) => row.macCount)).toEqual([2, 5])
  })

  test("a delta whose update returns no row is skipped", async () => {
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

describe("MacRepository — reconcilePeriod", () => {
  test("rebuilds WorkspaceMac count from ContactActiveMonthly", async () => {
    queueResult([])

    await repo.reconcilePeriod({
      workspaceId: "ws-1",
      periodStart: "2026-05-01T00:00:00.000Z",
    })

    expect(dbUpdate).toHaveBeenCalledTimes(1)
  })
})

describe("MacRepository — getActiveContactCountByWorkspaceId", () => {
  test("returns macCount and ISO period bounds from the row", async () => {
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

  test("returns a zero count when no active row exists", async () => {
    queueResult([])

    const result = await repo.getActiveContactCountByWorkspaceId({
      workspaceId: "ws-1",
    })

    expect(result.macCount).toBe(0)
    expect(result.periodStart).toBeUndefined()
    expect(result.periodEnd).toBeNull()
  })
})

describe("countActiveContactsForOwner", () => {
  test("counts only the current anchored period for a resetting plan", async () => {
    queueResult([{ value: 7 }])
    const repo = new MacRepository()

    const result = await repo.countActiveContactsForOwner({
      ownerId: "owner-1",
      billingPeriodStart: new Date("2026-06-01T00:00:00.000Z"),
      cumulative: false,
    })

    expect(result).toBe(7)
  })

  test("returns 0 for a period-less owner without querying", async () => {
    const repo = new MacRepository()

    const result = await repo.countActiveContactsForOwner({
      ownerId: "owner-1",
      billingPeriodStart: null,
      cumulative: false,
    })

    expect(result).toBe(0)
  })

  test("counts every period for a lifetime (cumulative) plan", async () => {
    queueResult([{ value: 25 }])
    const repo = new MacRepository()

    const result = await repo.countActiveContactsForOwner({
      ownerId: "owner-1",
      billingPeriodStart: new Date("2026-06-01T00:00:00.000Z"),
      cumulative: true,
    })

    expect(result).toBe(25)
  })
})

describe("MacRepository — countActiveContactsByWorkspace", () => {
  test("counts distinct hourly contacts in the requested range", async () => {
    const from = new Date("2026-05-10T00:00:00.000Z")
    const to = new Date("2026-05-20T00:00:00.000Z")
    queueResult([{ value: "2" }])

    const result = await repo.countActiveContactsByWorkspace({
      workspaceId: "ws-1",
      from,
      to,
    })

    expect(result).toBe(2)
    expect(countDistinct).toHaveBeenCalledWith("cah.contactId")
    expect(dbSelect).toHaveBeenCalledWith({
      value: { __countDistinct: true, column: "cah.contactId" },
    })

    const chain = dbSelect.mock.results.at(-1)?.value as QueryChain
    expect(chain.from).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: "cah.contactId",
        hourBucket: "cah.hourBucket",
      }),
    )
    expect(chain.innerJoin).not.toHaveBeenCalled()
    expect(eq).toHaveBeenCalledWith("cah.workspaceId", "ws-1")
    expect(gte).toHaveBeenCalledWith("cah.hourBucket", from)
    expect(lte).toHaveBeenCalledWith("cah.hourBucket", to)
    expect(dbExecute).not.toHaveBeenCalled()
  })

  test("returns 0 when no hourly rows match the range", async () => {
    queueResult([])

    const result = await repo.countActiveContactsByWorkspace({
      workspaceId: "ws-1",
      from: new Date("2026-05-10T00:00:00.000Z"),
      to: new Date("2026-05-20T00:00:00.000Z"),
    })

    expect(result).toBe(0)
  })
})
