import { beforeEach, describe, expect, test, vi } from "vitest"
import type { PreparedRow } from "../src/repositories/postgres/mac.repository"
import type {
  MacMessageInPayload,
  MacMessageOutPayload,
} from "../src/schemas/mac"

const macRepository = {
  ensureWorkspaceMac: vi.fn(),
  upsertMonthlyPresence: vi.fn(async () => [] as unknown[]),
  upsertHourlyPresence: vi.fn(async () => undefined),
  addWorkspaceMacCount: vi.fn(async () => [] as unknown[]),
}
vi.mock("../src/repositories/postgres/mac.repository", () => ({
  macRepository,
  workspaceMacKey: (workspaceId: string, periodStart: Date, periodEnd: Date) =>
    `${workspaceId}|${periodStart.toISOString()}|${periodEnd.toISOString()}`,
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
  userQuotaModel: {
    userId: "userId",
    periodStart: "periodStart",
  },
}))

const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }
vi.mock("../src/lib/logger", () => ({ logger }))

const { MacTrackingService } = await import(
  "../src/services/mac-tracking.service"
)

const WORKSPACE_ID = "ws-1"
const PERIOD_START = "2026-01-10T09:00:00.000Z"
const CTX_KEY = `mac:ctx:ws:${WORKSPACE_ID}`

function seedQuotaContext(): void {
  distributedStore.getAll.mockResolvedValue({
    [CTX_KEY]: {
      userId: "user-1",
      periodStart: PERIOD_START,
    },
  })
}

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
  vi.clearAllMocks()
  vi.useRealTimers()
  selectRows.current = []
  distributedStore.getAll.mockResolvedValue({})
  bloomFilter.addMany.mockImplementation(async (_k, items) =>
    items.map(() => true),
  )
  macRepository.upsertMonthlyPresence.mockResolvedValue([])
  macRepository.upsertHourlyPresence.mockResolvedValue(undefined)
  macRepository.addWorkspaceMacCount.mockResolvedValue([])
  macRepository.ensureWorkspaceMac.mockImplementation(
    (
      entries: { workspaceId: string; periodStart: Date; periodEnd: Date }[],
    ) => {
      const map = new Map<string, string>()
      for (const e of entries) {
        map.set(
          `${e.workspaceId}|${e.periodStart.toISOString()}|${e.periodEnd.toISOString()}`,
          "wm-1",
        )
      }
      return map
    },
  )
})

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

  test("trackMessageInHourly no-ops on empty payloads", async () => {
    await newService().trackMessageInHourly([])
    expect(bloomFilter.addMany).not.toHaveBeenCalled()
    expect(macRepository.upsertHourlyPresence).not.toHaveBeenCalled()
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

  test("trackMessageOutHourly skips payloads missing contactInboxId", async () => {
    await newService().trackMessageOutHourly([
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
    expect(macRepository.upsertHourlyPresence).not.toHaveBeenCalled()
  })
})

describe("MacTrackingService — hourly activity tracking", () => {
  test("normalizes inbound payloads, truncates the hour, and writes outside the monthly transaction", async () => {
    await newService().trackMessageInHourly([
      makeInPayload({
        occurredAt: "2026-05-01T10:05:30.000Z",
      }),
    ])

    expect(db.transaction).not.toHaveBeenCalled()
    expect(macRepository.upsertMonthlyPresence).not.toHaveBeenCalled()
    expect(macRepository.upsertHourlyPresence).toHaveBeenCalledWith([
      {
        workspaceId: WORKSPACE_ID,
        contactId: "c-1",
        contactInboxId: "ci-1",
        inboxId: "ib-1",
        hourBucket: new Date("2026-05-01T10:00:00.000Z"),
      },
    ])
  })

  test("uses a workspace-hour bloom key and skips rows already seen that hour", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-01T10:05:30.000Z"))
    bloomFilter.addMany.mockResolvedValueOnce([true, false])

    await newService().trackMessageInHourly([
      makeInPayload({
        contactId: "c-1",
        contactInboxId: "ci-1",
        occurredAt: "2026-05-01T10:07:00.000Z",
      }),
      makeInPayload({
        contactId: "c-2",
        contactInboxId: "ci-2",
        occurredAt: "2026-05-01T10:12:00.000Z",
      }),
    ])

    expect(bloomFilter.addMany).toHaveBeenCalledWith(
      "mac:hourly-dedup:ws-1:2026-05-01T10:00:00.000Z",
      ["ci-1", "ci-2"],
      {
        errorRate: 0.001,
        capacity: 100_000,
        ttlSeconds: 3390,
      },
    )
    expect(macRepository.upsertHourlyPresence).toHaveBeenCalledWith([
      expect.objectContaining({ contactInboxId: "ci-1" }),
    ])
  })

  test("does not call the repository when the hour bloom rejects every row", async () => {
    bloomFilter.addMany.mockResolvedValueOnce([false])

    await newService().trackMessageOutHourly([makeOutPayload()])

    expect(macRepository.upsertHourlyPresence).not.toHaveBeenCalled()
  })

  test("deduplicates same contact-inbox rows before touching the hour bloom", async () => {
    await newService().trackMessageInHourly([
      makeInPayload({
        contactInboxId: "ci-1",
        occurredAt: "2026-05-01T10:05:00.000Z",
      }),
      makeInPayload({
        contactInboxId: "ci-1",
        occurredAt: "2026-05-01T10:40:00.000Z",
      }),
    ])

    expect(bloomFilter.addMany).toHaveBeenCalledWith(
      "mac:hourly-dedup:ws-1:2026-05-01T10:00:00.000Z",
      ["ci-1"],
      expect.anything(),
    )
    expect(macRepository.upsertHourlyPresence).toHaveBeenCalledWith([
      expect.objectContaining({
        contactInboxId: "ci-1",
        hourBucket: new Date("2026-05-01T10:00:00.000Z"),
      }),
    ])
  })

  test("collapses inbound and outbound activity in the same hour through the bloom gate", async () => {
    const seen = new Set<string>()
    bloomFilter.addMany.mockImplementation(async (key, items) =>
      items.map((item) => {
        const seenKey = `${key}:${item}`
        if (seen.has(seenKey)) {
          return false
        }
        seen.add(seenKey)
        return true
      }),
    )

    const service = newService()
    await service.trackMessageInHourly([makeInPayload()])
    await service.trackMessageOutHourly([makeOutPayload()])

    expect(macRepository.upsertHourlyPresence).toHaveBeenCalledTimes(1)
    expect(macRepository.upsertHourlyPresence).toHaveBeenCalledWith([
      expect.objectContaining({ contactInboxId: "ci-1" }),
    ])
  })

  test("resolves and logs when the hour bloom fails", async () => {
    bloomFilter.addMany.mockRejectedValueOnce(new Error("redis down"))

    await expect(
      newService().trackMessageInHourly([makeInPayload()]),
    ).resolves.toBeUndefined()

    expect(macRepository.upsertHourlyPresence).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      "[MacTrackingService] hourly incoming activity tracking failed",
    )
  })

  test("resolves and logs when the hourly insert fails", async () => {
    macRepository.upsertHourlyPresence.mockRejectedValueOnce(
      new Error("partition unavailable"),
    )

    await expect(
      newService().trackMessageOutHourly([makeOutPayload()]),
    ).resolves.toBeUndefined()

    expect(logger.warn).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      "[MacTrackingService] hourly outgoing activity tracking failed",
    )
  })
})

describe("MacTrackingService — bloom-filter dedup", () => {
  test("only keeps events the bloom filter reports as new", async () => {
    seedQuotaContext()
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
    seedQuotaContext()
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

describe("MacTrackingService — quota context", () => {
  test("skips events whose workspace has no quota context", async () => {
    distributedStore.getAll.mockResolvedValue({})
    selectRows.current = []

    await newService().trackMessageIn([makeInPayload()])

    expect(macRepository.ensureWorkspaceMac).not.toHaveBeenCalled()
    expect(macRepository.upsertMonthlyPresence).not.toHaveBeenCalled()
    expect(logger.debug).toHaveBeenCalled()
  })

  test("loads quota context from the database on cache miss", async () => {
    distributedStore.getAll.mockResolvedValue({})
    selectRows.current = [
      {
        workspaceId: WORKSPACE_ID,
        userId: "user-1",
        periodStart: new Date(PERIOD_START),
      },
    ]

    await newService().trackMessageIn([makeInPayload()])

    expect(db.select).toHaveBeenCalled()
    expect(distributedStore.putMany).toHaveBeenCalled()
    expect(macRepository.upsertMonthlyPresence).toHaveBeenCalledTimes(1)
  })
})

describe("MacTrackingService — id chain resolution", () => {
  test("attaches resolved workspaceMacId to prepared rows", async () => {
    seedQuotaContext()

    await newService().trackMessageIn([makeInPayload()])

    expect(macRepository.ensureWorkspaceMac).toHaveBeenCalledTimes(1)
    const [rows] = macRepository.upsertMonthlyPresence.mock.calls[0] as [
      PreparedRow[],
    ]
    expect(rows[0]?.workspaceMacId).toBe("wm-1")
  })
})

describe("MacTrackingService — occurredAt coercion", () => {
  test("accepts a string occurredAt from a bus-deserialized event", async () => {
    seedQuotaContext()

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

  test("falls back to now() for a malformed occurredAt", async () => {
    seedQuotaContext()

    await expect(
      newService().trackMessageIn([
        makeInPayload({ occurredAt: "not-a-date" }),
      ]),
    ).resolves.toBeUndefined()

    expect(macRepository.upsertMonthlyPresence).toHaveBeenCalledTimes(1)
    const [rows] = macRepository.upsertMonthlyPresence.mock.calls[0] as [
      PreparedRow[],
    ]
    expect(rows).toHaveLength(1)
    expect(Number.isNaN(rows[0]?.occurredAt.getTime())).toBe(false)
    expect(logger.warn).toHaveBeenCalled()
  })
})

describe("MacTrackingService — happy path", () => {
  test("writes monthly rows and bumps the workspace cache", async () => {
    seedQuotaContext()
    macRepository.upsertMonthlyPresence.mockResolvedValueOnce([
      { workspaceMacId: "wm-1", count: 3 },
    ])

    await newService().trackMessageOut([makeOutPayload()])

    expect(db.transaction).toHaveBeenCalledTimes(1)
    expect(macRepository.upsertMonthlyPresence).toHaveBeenCalledTimes(1)
    expect(macRepository.addWorkspaceMacCount).toHaveBeenCalledTimes(1)
    expect(distributedStore.incrementCounter).toHaveBeenCalledTimes(1)
  })

  test("maps message_out payloads to the message_out event code", async () => {
    seedQuotaContext()

    await newService().trackMessageOut([makeOutPayload()])

    const [rows] = macRepository.upsertMonthlyPresence.mock.calls[0] as [
      PreparedRow[],
    ]
    expect(rows[0]?.eventType).toBe(2)
  })

  test("skips the cache bump when no monthly presence rows are inserted", async () => {
    seedQuotaContext()
    macRepository.upsertMonthlyPresence.mockResolvedValueOnce([])

    await newService().trackMessageIn([makeInPayload()])

    expect(distributedStore.incrementCounter).not.toHaveBeenCalled()
  })
})

describe("MacTrackingService.claimNewActiveContact", () => {
  const input = {
    workspaceId: WORKSPACE_ID,
    contactId: "c-1",
    contactInboxId: "ci-1",
    inboxId: "ib-1",
    periodStart: new Date(PERIOD_START),
    occurredAt: new Date("2026-05-01T10:05:00.000Z"),
  }

  test("records presence and reports counted for a brand-new contact", async () => {
    macRepository.upsertMonthlyPresence.mockResolvedValueOnce([
      { workspaceMacId: "wm-1", count: 1 },
    ])

    const result = await newService().claimNewActiveContact(input, {} as never)

    expect(result).toEqual({ counted: true })
    expect(macRepository.upsertMonthlyPresence).toHaveBeenCalledTimes(1)
    expect(macRepository.addWorkspaceMacCount).toHaveBeenCalledWith(
      [{ id: "wm-1", count: 1 }],
      expect.anything(),
    )
  })

  test("also records the paired hourly presence row for a brand-new contact", async () => {
    macRepository.upsertMonthlyPresence.mockResolvedValueOnce([
      { workspaceMacId: "wm-1", count: 1 },
    ])
    const tx = {} as never

    await newService().claimNewActiveContact(input, tx)

    expect(macRepository.upsertHourlyPresence).toHaveBeenCalledTimes(1)
    expect(macRepository.upsertHourlyPresence).toHaveBeenCalledWith(
      [
        {
          workspaceId: WORKSPACE_ID,
          contactId: "c-1",
          contactInboxId: "ci-1",
          inboxId: "ib-1",
          hourBucket: new Date("2026-05-01T10:00:00.000Z"),
        },
      ],
      tx,
    )
  })

  test("still records the hourly presence row when the monthly row already exists (dedup)", async () => {
    macRepository.upsertMonthlyPresence.mockResolvedValueOnce([])

    const result = await newService().claimNewActiveContact(input, {} as never)

    expect(result).toEqual({ counted: false })
    expect(macRepository.addWorkspaceMacCount).not.toHaveBeenCalled()
    expect(macRepository.upsertHourlyPresence).toHaveBeenCalledTimes(1)
  })

  test("reports not counted when the presence row already exists (dedup)", async () => {
    macRepository.upsertMonthlyPresence.mockResolvedValueOnce([])

    const result = await newService().claimNewActiveContact(input, {} as never)

    expect(result).toEqual({ counted: false })
    expect(macRepository.addWorkspaceMacCount).not.toHaveBeenCalled()
  })

  test("reports not counted when the workspace MAC row cannot be ensured", async () => {
    macRepository.ensureWorkspaceMac.mockResolvedValueOnce(new Map())

    const result = await newService().claimNewActiveContact(input, {} as never)

    expect(result).toEqual({ counted: false })
    expect(macRepository.upsertMonthlyPresence).not.toHaveBeenCalled()
    expect(macRepository.upsertHourlyPresence).not.toHaveBeenCalled()
  })
})

describe("MacTrackingService.incrementWorkspaceMacCache", () => {
  test("bumps the workspace cache counter", async () => {
    await newService().incrementWorkspaceMacCache(WORKSPACE_ID, 1)
    expect(distributedStore.incrementCounter).toHaveBeenCalledTimes(1)
  })

  test("is a no-op for non-positive deltas", async () => {
    await newService().incrementWorkspaceMacCache(WORKSPACE_ID, 0)
    expect(distributedStore.incrementCounter).not.toHaveBeenCalled()
  })
})
