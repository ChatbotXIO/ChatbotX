import { beforeEach, describe, expect, test, vi } from "vitest"
import type { PreparedRow } from "../src/repositories/postgres/mac.repository"
import type {
  MacMessageInPayload,
  MacMessageOutPayload,
} from "../src/schemas/mac"

// --- Mocks ---------------------------------------------------------------

const macRepository = {
  ensureBillingMac: vi.fn(),
  ensureWorkspaceMac: vi.fn(),
  upsertMonthlyPresence: vi.fn(async () => [] as unknown[]),
  addWorkspaceMacCount: vi.fn(async () => [] as unknown[]),
  addBillingMacCount: vi.fn(async () => [] as unknown[]),
}
vi.mock("../src/repositories/postgres/mac.repository", () => ({
  macRepository,
  // The service imports these key helpers from the repository module.
  billingMacKey: (billingId: string, periodStart: Date, periodEnd: Date) =>
    `${billingId}|${periodStart.toISOString()}|${periodEnd.toISOString()}`,
  workspaceMacKey: (workspaceId: string, billingMacId: string) =>
    `${workspaceId}|${billingMacId}`,
}))

const distributedStore = {
  getAll: vi.fn(async () => ({}) as Record<string, unknown>),
  putMany: vi.fn(async () => undefined),
  incrementCounter: vi.fn(async () => undefined),
}
const bloomFilter = {
  addMany: vi.fn(async (_k: string, items: string[]) => items.map(() => true)),
}
vi.mock("@chatbotx.io/redis", () => ({ distributedStore, bloomFilter }))

// Billing-context owner lookup. `limit()` resolves the row list.
const selectRows: { current: unknown[] } = { current: [] }
const selectBuilder: Record<string, unknown> = {}
selectBuilder.from = vi.fn(() => selectBuilder)
selectBuilder.innerJoin = vi.fn(() => selectBuilder)
selectBuilder.where = vi.fn(() => selectBuilder)
selectBuilder.orderBy = vi.fn(() => selectBuilder)
selectBuilder.limit = vi.fn(async () => selectRows.current)
const db = {
  select: vi.fn(() => selectBuilder),
  transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})),
}
vi.mock("@chatbotx.io/database/client", () => ({
  db,
  and: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
  desc: (...args: unknown[]) => args,
  gt: (...args: unknown[]) => args,
  isNull: (...args: unknown[]) => args,
  lte: (...args: unknown[]) => args,
  or: (...args: unknown[]) => args,
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
  }),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  MAC_EVENT_TYPE: { MESSAGE_IN: 1, MESSAGE_OUT: 2, REACTION: 3 },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  workspaceModel: { id: "id" },
  workspaceMemberModel: {
    workspaceId: "workspaceId",
    userId: "userId",
    role: "role",
  },
  billingModel: {
    id: "id",
    userId: "userId",
    periodStart: "periodStart",
    periodEnd: "periodEnd",
  },
}))

const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }
vi.mock("../src/lib/logger", () => ({ logger }))

const { MacTrackingService } = await import(
  "../src/services/mac-tracking.service"
)

// --- Fixtures ------------------------------------------------------------

const WORKSPACE_ID = "ws-1"
const BILLING_PERIOD_START = "2026-01-10T09:00:00.000Z"
const CTX_KEY = `mac:ctx:ws:${WORKSPACE_ID}`

/** Seed the Redis billing-context cache so no DB lookup is needed. */
function seedBillingContext(): void {
  distributedStore.getAll.mockResolvedValue({
    [CTX_KEY]: {
      billingId: "bill-1",
      billingPeriodStart: BILLING_PERIOD_START,
    },
  })
}

// `occurredAt` defaults to an ISO string: that is what the payload actually
// holds once a `message:received` event round-trips through the bus as JSON.
function makeInPayload(
  overrides: Partial<MacMessageInPayload> = {},
): MacMessageInPayload {
  return {
    workspaceId: WORKSPACE_ID,
    contactId: "c-1",
    contactInboxId: "ci-1",
    inboxId: "ib-1",
    occurredAt: "2026-05-01T10:05:00.000Z",
    sourceId: "src-1",
    ...overrides,
  }
}

function makeOutPayload(
  overrides: Partial<MacMessageOutPayload> = {},
): MacMessageOutPayload {
  return {
    context: {
      workspaceId: WORKSPACE_ID,
      contactId: "c-1",
      contactInboxId: "ci-1",
      inboxId: "ib-1",
      channel: "messenger",
    },
    occurredAt: "2026-05-01T10:05:00.000Z",
    action: { messageId: "m-1" },
    ...overrides,
  }
}

function newService(): InstanceType<typeof MacTrackingService> {
  const service = new MacTrackingService()
  service.setBloomFilter(bloomFilter as never)
  return service
}

beforeEach(() => {
  selectRows.current = []
  distributedStore.getAll.mockResolvedValue({})
  bloomFilter.addMany.mockImplementation(async (_k, items) =>
    items.map(() => true),
  )
  macRepository.upsertMonthlyPresence.mockResolvedValue([])
  macRepository.addWorkspaceMacCount.mockResolvedValue([])
  macRepository.addBillingMacCount.mockResolvedValue([])
  // The id-chain resolvers echo back deterministic ids so resolveMacIds yields
  // a PreparedRow for every draft.
  macRepository.ensureBillingMac.mockImplementation(
    (entries: { billingId: string; periodStart: Date; periodEnd: Date }[]) => {
      const map = new Map<string, string>()
      for (const e of entries) {
        map.set(
          `${e.billingId}|${e.periodStart.toISOString()}|${e.periodEnd.toISOString()}`,
          "bm-1",
        )
      }
      return map
    },
  )
  macRepository.ensureWorkspaceMac.mockImplementation(
    (entries: { workspaceId: string; billingMacId: string }[]) => {
      const map = new Map<string, string>()
      for (const e of entries) {
        map.set(`${e.workspaceId}|${e.billingMacId}`, "wm-1")
      }
      return map
    },
  )
})

// --- Tests ---------------------------------------------------------------

describe("MacTrackingService — empty inputs", () => {
  test("track no-ops on empty event array", async () => {
    await newService().track([])
    expect(macRepository.upsertMonthlyPresence).not.toHaveBeenCalled()
  })

  test("trackMessageIn no-ops on empty payloads", async () => {
    await newService().trackMessageIn([])
    expect(bloomFilter.addMany).not.toHaveBeenCalled()
  })

  test("trackMessageOut no-ops on empty payloads", async () => {
    await newService().trackMessageOut([])
    expect(bloomFilter.addMany).not.toHaveBeenCalled()
  })
})

describe("MacTrackingService — payload filtering", () => {
  test("trackMessageOut skips payloads missing contactInboxId", async () => {
    await newService().trackMessageOut([
      makeOutPayload({
        context: {
          workspaceId: WORKSPACE_ID,
          contactId: "c-1",
          inboxId: "ib-1",
          channel: "messenger",
        },
      }),
    ])
    expect(bloomFilter.addMany).not.toHaveBeenCalled()
    expect(macRepository.upsertMonthlyPresence).not.toHaveBeenCalled()
  })
})

describe("MacTrackingService — bloom-filter dedup", () => {
  test("only keeps events the bloom filter reports as new", async () => {
    seedBillingContext()
    bloomFilter.addMany.mockResolvedValueOnce([true, false])

    await newService().trackMessageIn([
      makeInPayload({ contactInboxId: "ci-1" }),
      makeInPayload({ contactInboxId: "ci-2" }),
    ])

    expect(macRepository.upsertMonthlyPresence).toHaveBeenCalledTimes(1)
    const [rows] = macRepository.upsertMonthlyPresence.mock.calls[0] as [
      PreparedRow[],
    ]
    expect(rows).toHaveLength(1)
    expect(rows[0]?.contactInboxId).toBe("ci-1")
  })

  test("falls back to all events when the bloom filter throws", async () => {
    seedBillingContext()
    bloomFilter.addMany.mockRejectedValueOnce(new Error("redis down"))

    await newService().trackMessageIn([
      makeInPayload({ contactInboxId: "ci-1" }),
      makeInPayload({ contactInboxId: "ci-2" }),
    ])

    const [rows] = macRepository.upsertMonthlyPresence.mock.calls[0] as [
      PreparedRow[],
    ]
    expect(rows).toHaveLength(2)
    expect(logger.error).toHaveBeenCalled()
  })
})

describe("MacTrackingService — billing context", () => {
  test("skips events whose workspace has no billing record", async () => {
    distributedStore.getAll.mockResolvedValue({})
    selectRows.current = [] // DB lookup also returns nothing

    await newService().trackMessageIn([makeInPayload()])

    // No-billing rule: nothing is written and the skip is a debug log.
    expect(macRepository.ensureBillingMac).not.toHaveBeenCalled()
    expect(macRepository.upsertMonthlyPresence).not.toHaveBeenCalled()
    expect(logger.debug).toHaveBeenCalled()
  })

  test("loads billing context from the database on cache miss", async () => {
    distributedStore.getAll.mockResolvedValue({})
    selectRows.current = [
      {
        workspaceId: WORKSPACE_ID,
        billingId: "bill-db",
        billingPeriodStart: new Date(BILLING_PERIOD_START),
      },
    ]

    await newService().trackMessageIn([makeInPayload()])

    expect(db.select).toHaveBeenCalled()
    expect(distributedStore.putMany).toHaveBeenCalled()
    expect(macRepository.upsertMonthlyPresence).toHaveBeenCalledTimes(1)
  })
})

describe("MacTrackingService — id chain resolution", () => {
  test("attaches resolved billingMacId/workspaceMacId to prepared rows", async () => {
    seedBillingContext()

    await newService().trackMessageIn([makeInPayload()])

    expect(macRepository.ensureBillingMac).toHaveBeenCalledTimes(1)
    expect(macRepository.ensureWorkspaceMac).toHaveBeenCalledTimes(1)
    const [rows] = macRepository.upsertMonthlyPresence.mock.calls[0] as [
      PreparedRow[],
    ]
    expect(rows[0]?.billingMacId).toBe("bm-1")
    expect(rows[0]?.workspaceMacId).toBe("wm-1")
  })
})

describe("MacTrackingService — occurredAt coercion", () => {
  test("accepts a string occurredAt from a bus-deserialized event", async () => {
    seedBillingContext()

    // Regression: events round-tripped through the bus carry `occurredAt`
    // as an ISO string. `anchoredPeriod` needs a real Date.
    await newService().trackMessageIn([
      makeInPayload({ occurredAt: "2026-05-01T10:05:00.000Z" }),
    ])

    expect(macRepository.upsertMonthlyPresence).toHaveBeenCalledTimes(1)
    const [rows] = macRepository.upsertMonthlyPresence.mock.calls[0] as [
      PreparedRow[],
    ]
    expect(rows[0]?.occurredAt).toBeInstanceOf(Date)
    expect(rows[0]?.occurredAt.toISOString()).toBe("2026-05-01T10:05:00.000Z")
    expect(rows[0]?.hourBucket.toISOString()).toBe("2026-05-01T10:00:00.000Z")
    expect(logger.warn).not.toHaveBeenCalled()
  })

  test("falls back to now() for a malformed occurredAt instead of crashing", async () => {
    seedBillingContext()

    // Regression: a garbage `occurredAt` produced an Invalid Date that flowed
    // into `anchoredPeriod`, yielding NaN period bounds and crashing
    // `billingMacKey` with `RangeError: Invalid time value`.
    await expect(
      newService().trackMessageIn([
        makeInPayload({ occurredAt: "not-a-date" }),
      ]),
    ).resolves.toBeUndefined()

    expect(macRepository.upsertMonthlyPresence).toHaveBeenCalledTimes(1)
    const [rows] = macRepository.upsertMonthlyPresence.mock.calls[0] as [
      PreparedRow[],
    ]
    // Event is kept (billable activity is real) with a valid fallback Date.
    expect(rows).toHaveLength(1)
    expect(Number.isNaN(rows[0]?.occurredAt.getTime())).toBe(false)
    expect(logger.warn).toHaveBeenCalled()
  })

  test("falls back to now() when occurredAt is missing", async () => {
    seedBillingContext()

    await expect(
      newService().trackMessageIn([
        makeInPayload({ occurredAt: undefined as never }),
      ]),
    ).resolves.toBeUndefined()

    const [rows] = macRepository.upsertMonthlyPresence.mock.calls[0] as [
      PreparedRow[],
    ]
    expect(rows).toHaveLength(1)
    expect(Number.isNaN(rows[0]?.occurredAt.getTime())).toBe(false)
    expect(logger.warn).toHaveBeenCalled()
  })
})

describe("MacTrackingService — in-hour dedup", () => {
  test("collapses same workspace/contact/event within an hour, keeping the latest", async () => {
    seedBillingContext()

    await newService().trackMessageIn([
      makeInPayload({
        occurredAt: new Date("2026-05-01T10:05:00.000Z"),
        sourceId: "early",
      }),
      makeInPayload({
        occurredAt: new Date("2026-05-01T10:45:00.000Z"),
        sourceId: "late",
      }),
    ])

    const [rows] = macRepository.upsertMonthlyPresence.mock.calls[0] as [
      PreparedRow[],
    ]
    expect(rows).toHaveLength(1)
    expect(rows[0]?.occurredAt.toISOString()).toBe("2026-05-01T10:45:00.000Z")
    expect(rows[0]?.hourBucket.toISOString()).toBe("2026-05-01T10:00:00.000Z")
  })
})

describe("MacTrackingService — happy path", () => {
  test("writes monthly rows and bumps the count cache", async () => {
    seedBillingContext()
    macRepository.upsertMonthlyPresence.mockResolvedValueOnce([
      { workspaceMacId: "wm-1", count: 3 },
    ])

    await newService().trackMessageOut([makeOutPayload()])

    expect(db.transaction).toHaveBeenCalledTimes(1)
    expect(macRepository.upsertMonthlyPresence).toHaveBeenCalledTimes(1)
    expect(macRepository.addWorkspaceMacCount).toHaveBeenCalledTimes(1)
    expect(macRepository.addBillingMacCount).toHaveBeenCalledTimes(1)
    // One INCRBY for the workspace key, one for the billing key.
    expect(distributedStore.incrementCounter).toHaveBeenCalledTimes(2)
  })

  test("fans new-contact counts to WorkspaceMac and BillingMac by id", async () => {
    seedBillingContext()
    macRepository.upsertMonthlyPresence.mockResolvedValueOnce([
      { workspaceMacId: "wm-1", count: 3 },
    ])

    await newService().trackMessageOut([makeOutPayload()])

    const [wsDeltas] = macRepository.addWorkspaceMacCount.mock.calls[0] as [
      { id: string; count: number }[],
    ]
    expect(wsDeltas).toEqual([{ id: "wm-1", count: 3 }])
    const [blDeltas] = macRepository.addBillingMacCount.mock.calls[0] as [
      { id: string; count: number }[],
    ]
    expect(blDeltas).toEqual([{ id: "bm-1", count: 3 }])
  })

  test("two workspaces sharing one billingMac each emit a separate billing delta", async () => {
    // Both workspaces belong to billing `bill-1` (same BillingMac `bm-1`) but
    // have distinct WorkspaceMac ids. The billing counter must receive one
    // additive delta per workspace — `addBillingMacCount` sums them.
    distributedStore.getAll.mockResolvedValue({
      "mac:ctx:ws:ws-1": {
        billingId: "bill-1",
        billingPeriodStart: BILLING_PERIOD_START,
      },
      "mac:ctx:ws:ws-2": {
        billingId: "bill-1",
        billingPeriodStart: BILLING_PERIOD_START,
      },
    })
    macRepository.ensureWorkspaceMac.mockImplementation(
      (entries: { workspaceId: string; billingMacId: string }[]) => {
        const map = new Map<string, string>()
        for (const e of entries) {
          map.set(
            `${e.workspaceId}|${e.billingMacId}`,
            e.workspaceId === "ws-2" ? "wm-2" : "wm-1",
          )
        }
        return map
      },
    )
    macRepository.upsertMonthlyPresence.mockResolvedValueOnce([
      { workspaceMacId: "wm-1", count: 2 },
      { workspaceMacId: "wm-2", count: 3 },
    ])

    await newService().trackMessageIn([
      makeInPayload({ workspaceId: "ws-1", contactInboxId: "ci-1" }),
      makeInPayload({ workspaceId: "ws-2", contactInboxId: "ci-2" }),
    ])

    const [blDeltas] = macRepository.addBillingMacCount.mock.calls[0] as [
      { id: string; count: number }[],
    ]
    // One delta per workspace, both targeting the shared BillingMac id.
    expect(blDeltas).toEqual([
      { id: "bm-1", count: 2 },
      { id: "bm-1", count: 3 },
    ])
    // The billing cache key is bumped by the summed total (2 + 3).
    expect(distributedStore.incrementCounter).toHaveBeenCalledWith(
      "mac:count:bl:bill-1",
      5,
      expect.any(Number),
    )
  })

  test("maps message_out payloads to the message_out event code", async () => {
    seedBillingContext()

    await newService().trackMessageOut([makeOutPayload()])

    const [rows] = macRepository.upsertMonthlyPresence.mock.calls[0] as [
      PreparedRow[],
    ]
    expect(rows[0]?.eventType).toBe(2) // MAC_EVENT_TYPE.MESSAGE_OUT
  })

  test("skips the cache bump when no monthly presence rows are inserted", async () => {
    seedBillingContext()
    macRepository.upsertMonthlyPresence.mockResolvedValueOnce([])

    await newService().trackMessageIn([makeInPayload()])

    expect(distributedStore.incrementCounter).not.toHaveBeenCalled()
  })
})
