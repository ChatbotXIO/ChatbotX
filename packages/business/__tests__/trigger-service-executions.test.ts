import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest"

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
const incrWithWindow = vi.fn()
const loggerError = vi.fn()
const loggerWarn = vi.fn()
const loggerInfo = vi.fn()

vi.mock("../src/automation-action/references", () => ({
  findInvalidActionReferences: vi.fn(async () => []),
  indexesOfNewActions: vi.fn(() => new Set<number>()),
}))

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

// `trigger/service.ts` imports `triggerRepository` at module scope for the
// listPaginatedWithConditions/findWithConditions surface this file doesn't
// exercise. Left unmocked, the real `@chatbotx.io/database/repositories`
// barrel loads (pulling in contact-filter query builders that need the real
// schema) against the partial schema mock above and crashes at import time.
vi.mock("@chatbotx.io/database/repositories", () => ({
  triggerRepository: {
    listPaginatedWithConditions: vi.fn(),
    findWithConditions: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/events", () => ({ removeTriggerCache: vi.fn() }))
vi.mock("@chatbotx.io/redis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/redis")>()),
  distributedStore: {
    incrWithWindow: (...a: unknown[]) => incrWithWindow(...a),
  },
}))
vi.mock("../src/logger", () => ({
  logger: {
    error: (...a: unknown[]) => loggerError(...a),
    warn: (...a: unknown[]) => loggerWarn(...a),
    info: (...a: unknown[]) => loggerInfo(...a),
  },
}))
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
  test("onConflictDoNothing-inserts the execution row with triggerId/contactId/workspaceId", async () => {
    await triggerService.recordExecution({
      triggerId: "tr-1",
      contactId: "c-1",
      workspaceId: "ws-1",
    })

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerId: "tr-1",
        contactId: "c-1",
        workspaceId: "ws-1",
      }),
    )
    expect(insertOnConflictDoNothing).toHaveBeenCalledTimes(1)
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

describe("tryAcquireContactRun", () => {
  // The limiter's circuit is module state (per worker process) on a monotonic
  // clock; its transitions are covered in fail-open-circuit.test.ts. Here it only
  // has to start every test closed: one fake clock for the whole block, moved an
  // hour on per test, with a successful probe closing a circuit an earlier test
  // left open. (A clock created per test would restart at zero.)
  const BACKOFF_MS = 5000

  const acquire = () =>
    triggerService.tryAcquireContactRun({
      workspaceId: "ws-1",
      triggerId: "tr-1",
      contactId: "c-1",
    })

  beforeAll(() => {
    vi.useFakeTimers({
      toFake: ["performance", "setTimeout", "clearTimeout"],
    })
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  beforeEach(async () => {
    vi.advanceTimersByTime(3_600_000)
    incrWithWindow.mockReset()
    incrWithWindow.mockResolvedValue(1)
    await acquire()
    incrWithWindow.mockReset()
    loggerError.mockClear()
    loggerInfo.mockClear()
    loggerWarn.mockClear()
  })

  test("counts the run per trigger and contact in a one-minute window", async () => {
    incrWithWindow.mockResolvedValue(1)

    await expect(acquire()).resolves.toBe(true)

    expect(incrWithWindow).toHaveBeenCalledWith(
      "trigger:contact-run:tr-1:c-1",
      60,
    )
  })

  test("allows the 20th run of a window and denies the 21st", async () => {
    incrWithWindow.mockResolvedValueOnce(20).mockResolvedValueOnce(21)

    await expect(acquire()).resolves.toBe(true)
    await expect(acquire()).resolves.toBe(false)
  })

  test("warns only at the first denial of a window, with the workspace for context", async () => {
    incrWithWindow.mockResolvedValueOnce(21).mockResolvedValueOnce(22)

    await acquire()
    await acquire()

    expect(loggerWarn).toHaveBeenCalledTimes(1)
    expect(loggerWarn).toHaveBeenCalledWith(
      { workspaceId: "ws-1", triggerId: "tr-1", contactId: "c-1" },
      expect.stringContaining("run limit exceeded"),
    )
  })

  test("does not warn for runs within the limit", async () => {
    incrWithWindow.mockResolvedValue(20)

    await acquire()

    expect(loggerWarn).not.toHaveBeenCalled()
  })

  test("fails open and logs once when Redis is unavailable, then skips Redis for the backoff", async () => {
    incrWithWindow.mockRejectedValueOnce(new Error("Redis unavailable"))

    await expect(acquire()).resolves.toBe(true)
    expect(loggerError).toHaveBeenCalledTimes(1)
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        workspaceId: "ws-1",
        triggerId: "tr-1",
      }),
      expect.any(String),
    )

    incrWithWindow.mockClear()
    vi.advanceTimersByTime(BACKOFF_MS - 1)
    await expect(acquire()).resolves.toBe(true)
    expect(incrWithWindow).not.toHaveBeenCalled()
    expect(loggerError).toHaveBeenCalledTimes(1)
  })

  test("a hung Redis is cut off at the call timeout and treated as a failure", async () => {
    // Redis that never answers: the promise intentionally stays pending.
    incrWithWindow.mockReturnValueOnce(new Promise<number>(() => undefined))

    const run = acquire()
    await vi.advanceTimersByTimeAsync(1000)

    await expect(run).resolves.toBe(true)
    expect(loggerError).toHaveBeenCalledTimes(1)
  })

  test("counts again and logs the recovery once the probe after the backoff succeeds", async () => {
    incrWithWindow.mockRejectedValueOnce(new Error("Redis unavailable"))
    await acquire()
    vi.advanceTimersByTime(BACKOFF_MS)
    incrWithWindow.mockResolvedValue(21)

    await expect(acquire()).resolves.toBe(false)

    expect(loggerInfo).toHaveBeenCalledTimes(1)
  })
})
