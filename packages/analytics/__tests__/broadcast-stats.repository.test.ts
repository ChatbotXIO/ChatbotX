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
  broadcastModel: {
    id: "b.id",
    workspaceId: "b.workspaceId",
  },
}))

const { BroadcastStatsRepository } = await import(
  "../src/repositories/postgres/broadcast-stats.repository"
)

beforeEach(() => {
  resultQueue.length = 0
  vi.clearAllMocks()
})

describe("BroadcastStatsRepository — workspace scoping", () => {
  test("getBatchStats joins Broadcast and filters every subquery on workspaceId", async () => {
    // No rows returned for any subquery — simulates a broadcast belonging to
    // a different workspace than the caller's.
    queueResult([]) // delivered
    queueResult([]) // seen
    queueResult([]) // clicked
    queueResult([]) // failed

    const repo = new BroadcastStatsRepository()
    const result = await repo.getBatchStats({
      workspaceId: "ws-A",
      broadcastIds: ["broadcast-of-ws-B"],
    })

    // Every subquery joins Broadcast and scopes on workspaceId — this is the
    // regression test for the cross-tenant IDOR: without the join+filter,
    // `getBatchStats({ workspaceId: "ws-A", broadcastIds: ["b-of-ws-B"] })`
    // would return workspace B's real counts instead of empty stats.
    expect(dbSelect).toHaveBeenCalledTimes(4)
    for (const chainResult of dbSelect.mock.results) {
      const chain = chainResult.value as QueryChain
      expect(chain.innerJoin).toHaveBeenCalledWith(
        { id: "b.id", workspaceId: "b.workspaceId" },
        { op: "eq", args: ["cob.broadcastId", "b.id"] },
      )
    }

    const workspaceScopedCalls = eq.mock.calls.filter(
      (call) => call[0] === "b.workspaceId" && call[1] === "ws-A",
    )
    expect(workspaceScopedCalls.length).toBeGreaterThan(0)

    expect(result["broadcast-of-ws-B"]).toEqual({
      "message:sent": 0,
      "message:delivered": 0,
      "message:seen": 0,
      "flow:clicked": 0,
      "message:failed": 0,
    })
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
      { id: "b.id", workspaceId: "b.workspaceId" },
      { op: "eq", args: ["cob.broadcastId", "b.id"] },
    )

    const whereArg = chain.where.mock.calls[0][0] as { values: unknown[] }
    expect(whereArg.values).toContain("ws-A")
  })
})
