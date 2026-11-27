import { beforeEach, describe, expect, test, vi } from "vitest"

const sql = (strings: TemplateStringsArray, ...values: unknown[]) => ({
  strings,
  values,
})
sql.join = (items: unknown[]) => ({ __join: items })

const resultQueue: unknown[][] = []
function queueResult(rows: unknown[]): void {
  resultQueue.push(rows)
}
function nextResult(): unknown[] {
  return resultQueue.length > 0 ? (resultQueue.shift() as unknown[]) : []
}

const CHAIN_METHODS = [
  "select",
  "from",
  "innerJoin",
  "where",
  "groupBy",
  "orderBy",
  "limit",
  "offset",
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

const dbSelect = vi.fn(makeChain)
const and = vi.fn((...args: unknown[]) => ({ op: "and", args }))
const eq = vi.fn((...args: unknown[]) => ({ op: "eq", args }))
const gt = vi.fn((...args: unknown[]) => ({ op: "gt", args }))
const inArray = vi.fn((...args: unknown[]) => ({ op: "inArray", args }))
const isNotNull = vi.fn((...args: unknown[]) => ({ op: "isNotNull", args }))
const notInArray = vi.fn((...args: unknown[]) => ({
  op: "notInArray",
  args,
}))
const or = vi.fn((...args: unknown[]) => ({ op: "or", args }))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    select: dbSelect,
    execute: vi.fn(),
  },
  sql,
  and,
  count: () => ({ __count: true }),
  eq,
  gt,
  inArray,
  isNotNull,
  notInArray,
  or,
}))

const countBySources = vi.fn()
const listContacts = vi.fn()
const countContacts = vi.fn()
const listContactIds = vi.fn()
vi.mock("@chatbotx.io/database/repositories/contact-info-capture", () => ({
  contactInfoCaptureRepository: {
    countBySources,
    listContacts,
    countContacts,
    listContactIds,
  },
}))

vi.mock("@chatbotx.io/database/queries/date-bucket", () => ({
  zonedBucketKey: (...args: unknown[]) => ({ bucketKey: args }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactsOnBroadcastsModel: {
    broadcastId: "cob.broadcastId",
    contactId: "cob.contactId",
    contactInboxId: "cob.contactInboxId",
    conversationId: "cob.conversationId",
    deliveredAt: "cob.deliveredAt",
    seenAt: "cob.seenAt",
    clickedAt: "cob.clickedAt",
    failedAt: "cob.failedAt",
    errorContent: "cob.errorContent",
  },
  contactInfoCaptureModel: {
    workspaceId: "cic.workspaceId",
    sourceType: "cic.sourceType",
    sourceId: "cic.sourceId",
    infoType: "cic.infoType",
  },
  broadcastModel: {
    id: "b.id",
    workspaceId: "b.workspaceId",
    occurrenceAt: "b.occurrenceAt",
    parentBroadcastId: "b.parentBroadcastId",
  },
}))

const EMPTY_STATS = {
  "message:sent": 0,
  "message:delivered": 0,
  "message:seen": 0,
  "flow:clicked": 0,
  "message:failed": 0,
  "contactInfo:phoneCaptured": 0,
  "contactInfo:emailCaptured": 0,
}

const { BroadcastStatsRepository } = await import(
  "../src/repositories/postgres/broadcast-stats.repository"
)

beforeEach(() => {
  resultQueue.length = 0
  vi.clearAllMocks()
  countBySources.mockResolvedValue([])
  listContacts.mockResolvedValue([])
  countContacts.mockResolvedValue(0)
  listContactIds.mockResolvedValue([])
})

describe("BroadcastStatsRepository — workspace scoping", () => {
  test("getBatchStats is a single scoped pass: one select, joined to Broadcast and filtered on workspaceId", async () => {
    // No rows: simulates a broadcast belonging to another workspace.
    queueResult([])

    const repo = new BroadcastStatsRepository()
    const result = await repo.getBatchStats({
      workspaceId: "ws-A",
      broadcastIds: ["broadcast-of-ws-B"],
    })

    // Regression test for the cross-tenant IDOR: without the join+filter,
    // `getBatchStats({ workspaceId: "ws-A", broadcastIds: ["b-of-ws-B"] })`
    // would return workspace B's real counts instead of empty stats.
    expect(dbSelect).toHaveBeenCalledTimes(1)
    expect(countBySources).toHaveBeenCalledWith({
      workspaceId: "ws-A",
      sourceType: "broadcast",
      sourceIds: ["broadcast-of-ws-B"],
    })
    const chain = dbSelect.mock.results[0].value as QueryChain
    expect(chain.innerJoin).toHaveBeenCalledWith(
      {
        id: "b.id",
        workspaceId: "b.workspaceId",
        occurrenceAt: "b.occurrenceAt",
        parentBroadcastId: "b.parentBroadcastId",
      },
      { op: "eq", args: ["cob.broadcastId", "b.id"] },
    )
    expect(
      eq.mock.calls.filter(
        (call) => call[0] === "b.workspaceId" && call[1] === "ws-A",
      ).length,
    ).toBeGreaterThan(0)

    expect(result["broadcast-of-ws-B"]).toEqual(EMPTY_STATS)
  })

  test("getBatchStats maps aggregated counts and derives sent = delivered + failed", async () => {
    queueResult([
      { broadcastId: "b1", delivered: 8, seen: 5, clicked: 2, failed: 3 },
    ])

    const repo = new BroadcastStatsRepository()
    const result = await repo.getBatchStats({
      workspaceId: "ws-A",
      broadcastIds: ["b1", "b2"],
    })

    expect(result.b1).toEqual({
      "message:sent": 11,
      "message:delivered": 8,
      "message:seen": 5,
      "flow:clicked": 2,
      "message:failed": 3,
      "contactInfo:phoneCaptured": 0,
      "contactInfo:emailCaptured": 0,
    })
    // A broadcast with no recipient rows still gets zeroed stats.
    expect(result.b2).toEqual(EMPTY_STATS)
  })

  test("getBatchStats adds the capture counts per broadcast and info type, defaulting to 0", async () => {
    queueResult([
      { broadcastId: "b1", delivered: 8, seen: 5, clicked: 2, failed: 3 },
    ])
    countBySources.mockResolvedValue([
      { sourceId: "b1", infoType: "phone", count: 4 },
      { sourceId: "b1", infoType: "email", count: 1 },
      { sourceId: "b2", infoType: "email", count: 6 },
    ])

    const repo = new BroadcastStatsRepository()
    const result = await repo.getBatchStats({
      workspaceId: "ws-A",
      broadcastIds: ["b1", "b2", "b3"],
    })

    expect(result.b1).toMatchObject({
      "message:delivered": 8,
      "contactInfo:phoneCaptured": 4,
      "contactInfo:emailCaptured": 1,
    })
    // Captures without recipient rows still surface; the rest stay 0.
    expect(result.b2).toEqual({
      ...EMPTY_STATS,
      "contactInfo:emailCaptured": 6,
    })
    expect(result.b3).toEqual(EMPTY_STATS)
  })

  test("getBatchStats ignores capture rows of ids it was not asked about", async () => {
    queueResult([])
    countBySources.mockResolvedValue([
      { sourceId: "stray", infoType: "phone", count: 9 },
    ])

    const repo = new BroadcastStatsRepository()
    const result = await repo.getBatchStats({
      workspaceId: "ws-A",
      broadcastIds: ["b1"],
    })

    expect(Object.keys(result)).toEqual(["b1"])
    expect(result.b1).toEqual(EMPTY_STATS)
  })

  test("getBatchStats short-circuits on an empty id list", async () => {
    const repo = new BroadcastStatsRepository()
    expect(
      await repo.getBatchStats({ workspaceId: "ws-A", broadcastIds: [] }),
    ).toEqual({})
    expect(dbSelect).not.toHaveBeenCalled()
    expect(countBySources).not.toHaveBeenCalled()
  })

  test("getStatsByOccurrenceBucket scopes on workspace and parent, returns one entry per requested bucket", async () => {
    queueResult([
      { bucket: "2026-10-12", delivered: 4, seen: 1, clicked: 0, failed: 1 },
    ])

    const repo = new BroadcastStatsRepository()
    const result = await repo.getStatsByOccurrenceBucket({
      workspaceId: "ws-A",
      parentBroadcastId: "tpl-1",
      granularity: "day",
      timezone: "Asia/Ho_Chi_Minh",
      buckets: ["2026-10-12", "2026-10-11"],
    })

    // Recipients and captures: two grouped reads, however many buckets.
    expect(dbSelect).toHaveBeenCalledTimes(2)
    expect(eq).toHaveBeenCalledWith("b.workspaceId", "ws-A")
    expect(eq).toHaveBeenCalledWith("b.parentBroadcastId", "tpl-1")
    expect(eq).toHaveBeenCalledWith("cic.workspaceId", "ws-A")
    expect(eq).toHaveBeenCalledWith("cic.sourceType", "broadcast")
    expect(result["2026-10-12"]["message:sent"]).toBe(5)
    // A bucket with only skipped/missed slots has no recipients: zeros, not absent.
    expect(result["2026-10-11"]).toEqual(EMPTY_STATS)
  })

  test("getStatsByOccurrenceBucket groups by ordinal so the parameterised bucket expression is not repeated", async () => {
    queueResult([])
    const repo = new BroadcastStatsRepository()
    await repo.getStatsByOccurrenceBucket({
      workspaceId: "ws-A",
      parentBroadcastId: "tpl-1",
      granularity: "month",
      timezone: "UTC",
      buckets: ["2026-10-01"],
    })
    for (const result of dbSelect.mock.results) {
      const chain = result.value as QueryChain
      const [groupBy] = chain.groupBy.mock.calls[0] as [{ strings: string[] }]
      expect(groupBy.strings.join("")).toBe("1")
    }
  })

  test("getStatsByOccurrenceBucket adds each run's captures to its bucket", async () => {
    queueResult([
      { bucket: "2026-10-12", delivered: 4, seen: 1, clicked: 0, failed: 1 },
    ])
    queueResult([
      { bucket: "2026-10-12", infoType: "phone", count: 3 },
      { bucket: "2026-10-12", infoType: "email", count: 2 },
      { bucket: "2026-10-11", infoType: "phone", count: 1 },
      { bucket: "2026-09-01", infoType: "phone", count: 7 },
    ])

    const repo = new BroadcastStatsRepository()
    const result = await repo.getStatsByOccurrenceBucket({
      workspaceId: "ws-A",
      parentBroadcastId: "tpl-1",
      granularity: "day",
      timezone: "UTC",
      buckets: ["2026-10-12", "2026-10-11"],
    })

    expect(result["2026-10-12"]).toMatchObject({
      "message:sent": 5,
      "contactInfo:phoneCaptured": 3,
      "contactInfo:emailCaptured": 2,
    })
    // A bucket with captures but no recipient rows keeps its zeros elsewhere.
    expect(result["2026-10-11"]).toEqual({
      ...EMPTY_STATS,
      "contactInfo:phoneCaptured": 1,
    })
    // A bucket nobody asked for is dropped.
    expect(result["2026-09-01"]).toBeUndefined()
  })

  test("getStatsByOccurrenceBucket does not query when no buckets are requested", async () => {
    const repo = new BroadcastStatsRepository()
    expect(
      await repo.getStatsByOccurrenceBucket({
        workspaceId: "ws-A",
        parentBroadcastId: "tpl-1",
        granularity: "week",
        timezone: "UTC",
        buckets: [],
      }),
    ).toEqual({})
    expect(dbSelect).not.toHaveBeenCalled()
  })

  test("getContacts joins Broadcast and filters on workspaceId", async () => {
    queueResult([])

    const repo = new BroadcastStatsRepository()
    await repo.getContacts({
      workspaceId: "ws-A",
      broadcastId: "broadcast-of-ws-B",
      eventType: "message:delivered",
      page: 1,
      perPage: 20,
    })

    const chain = dbSelect.mock.results[0].value as QueryChain
    expect(chain.innerJoin).toHaveBeenCalledWith(
      expect.objectContaining({ id: "b.id", workspaceId: "b.workspaceId" }),
      { op: "eq", args: ["cob.broadcastId", "b.id"] },
    )

    const whereArg = chain.where.mock.calls[0][0] as { values: unknown[] }
    expect(whereArg.values).toContain("ws-A")
  })
})

describe("BroadcastStatsRepository — contact-info capture events", () => {
  test("getContacts reads the capture table, not the recipients, and pages by offset", async () => {
    listContacts.mockResolvedValue([
      {
        contactId: "c1",
        contactInboxId: "ci1",
        conversationId: "cv1",
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
        inboxId: "i1",
      },
    ])
    countContacts.mockResolvedValue(41)

    const repo = new BroadcastStatsRepository()
    const result = await repo.getContacts({
      workspaceId: "ws-A",
      broadcastId: "b1",
      eventType: "contactInfo:phoneCaptured",
      page: 3,
      perPage: 20,
    })

    expect(dbSelect).not.toHaveBeenCalled()
    expect(listContacts).toHaveBeenCalledWith({
      workspaceId: "ws-A",
      sourceType: "broadcast",
      sourceId: "b1",
      infoType: "phone",
      limit: 20,
      offset: 40,
    })
    expect(countContacts).toHaveBeenCalledWith({
      workspaceId: "ws-A",
      sourceType: "broadcast",
      sourceId: "b1",
      infoType: "phone",
    })
    expect(result.total).toBe(41)
    expect(result.contactInboxIds).toEqual(["ci1"])
    expect(result.contactEventMap.get("ci1")).toEqual({
      contactId: "c1",
      contactInboxId: "ci1",
      occurredAt: "2026-01-02T00:00:00.000Z",
      conversationId: "cv1",
    })
  })

  test("getContacts maps the email event to the email info type and a missing count to 0", async () => {
    const repo = new BroadcastStatsRepository()
    const result = await repo.getContacts({
      workspaceId: "ws-A",
      broadcastId: "b1",
      eventType: "contactInfo:emailCaptured",
      page: 1,
      perPage: 20,
    })

    expect(listContacts).toHaveBeenCalledWith(
      expect.objectContaining({ infoType: "email", offset: 0 }),
    )
    expect(result).toEqual({
      contactInboxIds: [],
      contactEventMap: new Map(),
      total: 0,
    })
  })

  test("getContactIdsPage branches to the capture repository before building an event filter", async () => {
    listContactIds.mockResolvedValue(["10", "11"])

    const repo = new BroadcastStatsRepository()
    const rows = await repo.getContactIdsPage({
      workspaceId: "ws-A",
      broadcastId: "b1",
      eventType: "contactInfo:emailCaptured",
      cursor: "9",
      limit: 100,
      excludeContactIds: ["11"],
    })

    expect(dbSelect).not.toHaveBeenCalled()
    expect(listContactIds).toHaveBeenCalledWith({
      workspaceId: "ws-A",
      sourceType: "broadcast",
      sourceId: "b1",
      infoType: "email",
      afterContactId: "9",
      excludeContactIds: ["11"],
      limit: 100,
    })
    expect(rows).toEqual([
      { id: "10", contactId: "10" },
      { id: "11", contactId: "11" },
    ])
  })

  test("getContactIdsPage omits the cursor on the first page and keeps recipient events on the recipient table", async () => {
    const repo = new BroadcastStatsRepository()
    await repo.getContactIdsPage({
      workspaceId: "ws-A",
      broadcastId: "b1",
      eventType: "contactInfo:phoneCaptured",
      cursor: null,
      limit: 10,
    })
    expect(listContactIds).toHaveBeenCalledWith(
      expect.objectContaining({ afterContactId: undefined }),
    )

    queueResult([])
    await repo.getContactIdsPage({
      workspaceId: "ws-A",
      broadcastId: "b1",
      eventType: "message:seen",
      cursor: null,
      limit: 10,
    })
    expect(dbSelect).toHaveBeenCalledTimes(1)
    expect(listContactIds).toHaveBeenCalledTimes(1)
  })
})
