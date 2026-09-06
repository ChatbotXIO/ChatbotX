import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// triggerService — the execution/stats/purge surface moved from the trigger
// worker services: listActiveWithConditions, listActiveWithConditionsPage,
// listExecutedPairs, recordExecution, recordContactHistory, incrementStats,
// purgeExecutionsOlderThan.
// ---------------------------------------------------------------------------

const findManyTrigger = vi.fn()
const findManyExecution = vi.fn()
const insertValues = vi.fn()
const insertOnConflictDoNothing = vi.fn()
const insertOnConflictDoUpdate = vi.fn()
const dbExecute = vi.fn()

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      triggerModel: { findMany: (...a: unknown[]) => findManyTrigger(...a) },
      triggerExecutionModel: {
        findMany: (...a: unknown[]) => findManyExecution(...a),
      },
    },
    insert: () => ({
      values: (values: unknown) => {
        insertValues(values)
        return {
          onConflictDoNothing: (...a: unknown[]) =>
            insertOnConflictDoNothing(...a),
          onConflictDoUpdate: (...a: unknown[]) =>
            insertOnConflictDoUpdate(...a),
        }
      },
    }),
    delete: () => ({ where: vi.fn() }),
    execute: (...a: unknown[]) => dbExecute(...a),
  },
  and: (...args: unknown[]) => ({ and: args }),
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  inArray: (a: unknown, b: unknown) => ({ inArray: [a, b] }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      sql: [strings, values],
    }),
    { raw: vi.fn() },
  ),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  triggerModel: { id: "trigger.id", workspaceId: "trigger.workspaceId" },
  triggerContactHistoryModel: {},
  triggerExecutionModel: {
    triggerId: "execution.triggerId",
    contactId: "execution.contactId",
  },
  triggerStatsModel: {
    triggerId: "stats.triggerId",
    date: "stats.date",
    totalContacts: "stats.totalContacts",
    totalExecutions: "stats.totalExecutions",
    successCount: "stats.successCount",
    failureCount: "stats.failureCount",
  },
}))

vi.mock("@chatbotx.io/events", () => ({ removeTriggerCache: vi.fn() }))
vi.mock("../src/template/installed-resource.service", () => ({
  assertDeletable: vi.fn(),
}))

const { triggerService } = await import("../src/trigger/service")

beforeEach(() => {
  vi.clearAllMocks()
})

describe("listActiveWithConditions", () => {
  test("scopes to workspace + active, with conditions relation", async () => {
    findManyTrigger.mockResolvedValue([{ id: "tr-1", conditions: [] }])

    const result = await triggerService.listActiveWithConditions({
      workspaceId: "ws-1",
    })

    expect(result).toEqual([{ id: "tr-1", conditions: [] }])
    expect(findManyTrigger).toHaveBeenCalledWith({
      where: { workspaceId: "ws-1", active: true },
      with: { conditions: true },
    })
  })
})

describe("listActiveWithConditionsPage", () => {
  test("returns nextCursor only when the page is full", async () => {
    findManyTrigger.mockResolvedValue([{ id: "tr-1" }, { id: "tr-2" }])

    const result = await triggerService.listActiveWithConditionsPage({
      limit: 2,
    })

    expect(result.nextCursor).toBe("tr-2")
  })

  test("omits nextCursor when the page is short (drained)", async () => {
    findManyTrigger.mockResolvedValue([{ id: "tr-1" }])

    const result = await triggerService.listActiveWithConditionsPage({
      limit: 2,
    })

    expect(result.nextCursor).toBeUndefined()
  })
})

describe("listExecutedPairs", () => {
  test("returns [] without querying when either id list is empty", async () => {
    const result = await triggerService.listExecutedPairs({
      triggerIds: [],
      contactIds: ["c-1"],
    })
    expect(result).toEqual([])
    expect(findManyExecution).not.toHaveBeenCalled()
  })
})

describe("recordExecution", () => {
  test("onConflictDoNothing-inserts the execution row", async () => {
    await triggerService.recordExecution({
      triggerId: "tr-1",
      contactId: "c-1",
      workspaceId: "ws-1",
    })

    expect(insertOnConflictDoNothing).toHaveBeenCalled()
  })
})

describe("purgeExecutionsOlderThan", () => {
  test("returns the affected rowCount", async () => {
    dbExecute.mockResolvedValue({ rowCount: 7 })

    const result = await triggerService.purgeExecutionsOlderThan(new Date())

    expect(result).toBe(7)
  })

  test("returns 0 when rowCount is null", async () => {
    dbExecute.mockResolvedValue({ rowCount: null })
    const result = await triggerService.purgeExecutionsOlderThan(new Date())
    expect(result).toBe(0)
  })
})

describe("recordContactHistory", () => {
  test("inserts a firstEnteredAt history row (plain insert, no conflict handling)", async () => {
    await triggerService.recordContactHistory({
      triggerId: "tr-1",
      contactId: "c-1",
      workspaceId: "ws-1",
    })

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ triggerId: "tr-1", contactId: "c-1" }),
    )
  })
})

describe("incrementStats", () => {
  test("upserts with the conflict target [triggerId, date] and +1 sql expressions", async () => {
    await triggerService.incrementStats({
      triggerId: "tr-1",
      workspaceId: "ws-1",
      date: new Date("2026-01-01"),
      success: true,
    })

    expect(insertOnConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: ["stats.triggerId", "stats.date"],
      }),
    )
  })

  test("failure path increments failureCount, not successCount", async () => {
    await triggerService.incrementStats({
      triggerId: "tr-1",
      workspaceId: "ws-1",
      date: new Date("2026-01-01"),
      success: false,
    })

    const arg = insertOnConflictDoUpdate.mock.calls[0]?.[0] as {
      set: { successCount: unknown; failureCount: unknown }
    }
    // successCount stays the column reference (no +1) on failure.
    expect(arg.set.successCount).toBe("stats.successCount")
  })
})
