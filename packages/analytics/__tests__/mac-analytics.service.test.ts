import { beforeEach, describe, expect, test, vi } from "vitest"

// --- Mocks ---------------------------------------------------------------

const macRepository = {
  getActiveContactCountByWorkspaceId: vi.fn(async () => ({ macCount: 0 })),
  getActiveContactCountByBillingId: vi.fn(async () => ({ macCount: 0 })),
  reconcilePeriod: vi.fn(async () => undefined),
}
vi.mock("../src/repositories/postgres/mac.repository", () => ({
  macRepository,
}))

const distributedStore = {
  getNumber: vi.fn(async () => null as number | null),
  setNumberIfNotExists: vi.fn(async () => undefined),
}
vi.mock("@chatbotx.io/redis", () => ({ distributedStore }))

// `reconcilePeriod` now runs inside `db.transaction`; the fake passes a stub
// transaction client straight through to the callback.
const txClient = { tx: true }
const db = {
  transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(txClient)),
}
vi.mock("@chatbotx.io/database/client", () => ({ db }))

const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
vi.mock("../src/lib/logger", () => ({ logger }))

const { MacAnalyticsService } = await import(
  "../src/services/mac-analytics.service"
)

beforeEach(() => {
  distributedStore.getNumber.mockResolvedValue(null)
  macRepository.getActiveContactCountByWorkspaceId.mockResolvedValue({
    macCount: 0,
  })
  macRepository.getActiveContactCountByBillingId.mockResolvedValue({
    macCount: 0,
  })
})

// --- Tests ---------------------------------------------------------------

describe("MacAnalyticsService.getActiveContactCountByWorkspaceId", () => {
  test("returns the cached value without hitting the repository", async () => {
    distributedStore.getNumber.mockResolvedValue(42)

    const count =
      await new MacAnalyticsService().getActiveContactCountByWorkspaceId({
        workspaceId: "ws-1",
      })

    expect(count).toBe(42)
    expect(
      macRepository.getActiveContactCountByWorkspaceId,
    ).not.toHaveBeenCalled()
  })

  test("loads from the repository and populates the cache on a miss", async () => {
    distributedStore.getNumber.mockResolvedValue(null)
    macRepository.getActiveContactCountByWorkspaceId.mockResolvedValue({
      macCount: 7,
    })

    const count =
      await new MacAnalyticsService().getActiveContactCountByWorkspaceId({
        workspaceId: "ws-1",
      })

    expect(count).toBe(7)
    expect(distributedStore.setNumberIfNotExists).toHaveBeenCalledWith(
      "mac:count:ws:ws-1",
      7,
      expect.any(Number),
    )
  })

  test("falls back to the repository when the cache read throws", async () => {
    distributedStore.getNumber.mockRejectedValue(new Error("redis down"))
    macRepository.getActiveContactCountByWorkspaceId.mockResolvedValue({
      macCount: 5,
    })

    const count =
      await new MacAnalyticsService().getActiveContactCountByWorkspaceId({
        workspaceId: "ws-1",
      })

    expect(count).toBe(5)
    expect(logger.error).toHaveBeenCalled()
  })

  test("still returns the count when cache populate throws", async () => {
    distributedStore.getNumber.mockResolvedValue(null)
    distributedStore.setNumberIfNotExists.mockRejectedValueOnce(
      new Error("redis down"),
    )
    macRepository.getActiveContactCountByWorkspaceId.mockResolvedValue({
      macCount: 9,
    })

    const count =
      await new MacAnalyticsService().getActiveContactCountByWorkspaceId({
        workspaceId: "ws-1",
      })

    expect(count).toBe(9)
    expect(logger.error).toHaveBeenCalled()
  })
})

describe("MacAnalyticsService.getActiveContactCountByBillingId", () => {
  test("uses the billing cache key namespace", async () => {
    distributedStore.getNumber.mockResolvedValue(null)
    macRepository.getActiveContactCountByBillingId.mockResolvedValue({
      macCount: 3,
    })

    const count =
      await new MacAnalyticsService().getActiveContactCountByBillingId({
        billingId: "bill-1",
      })

    expect(count).toBe(3)
    expect(distributedStore.setNumberIfNotExists).toHaveBeenCalledWith(
      "mac:count:bl:bill-1",
      3,
      expect.any(Number),
    )
  })
})

describe("MacAnalyticsService — repository delegation", () => {
  test("reconcilePeriod runs the repository call inside a transaction", async () => {
    const input = {
      workspaceId: "ws-1",
      periodStart: "2026-05-01T00:00:00.000Z",
    }
    await new MacAnalyticsService().reconcilePeriod(input)
    expect(db.transaction).toHaveBeenCalledTimes(1)
    expect(macRepository.reconcilePeriod).toHaveBeenCalledWith(input, txClient)
  })
})
