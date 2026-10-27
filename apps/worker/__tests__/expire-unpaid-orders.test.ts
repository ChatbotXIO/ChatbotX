import { beforeEach, describe, expect, test, vi } from "vitest"

const listOverdue = vi.fn()
const listStaleAttempts = vi.fn()
const settleStaleAttempt = vi.fn()
const postponeStaleAttempt = vi.fn()
const warn = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  orderPaymentService: {
    listOverdue,
    listStaleAttempts,
    settleStaleAttempt,
    postponeStaleAttempt,
  },
  withBlockedOwnerGuard: async (_workspaceId: string, fn: () => unknown) =>
    await fn(),
}))
vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: {
    runExclusive: async ({ fn }: { fn: () => unknown }) => await fn(),
  },
}))
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ warn, info: vi.fn() }),
}))

const { expireUnpaidOrders } = await import(
  "../src/schedule/handlers/expire-unpaid-orders"
)

const attempt = { id: "pay1", workspaceId: "ws1" }

beforeEach(() => {
  vi.clearAllMocks()
  listOverdue.mockResolvedValue([])
  listStaleAttempts.mockResolvedValue([attempt])
  postponeStaleAttempt.mockResolvedValue(undefined)
})

describe("expireUnpaidOrders: stale payment attempts", () => {
  test("a settled attempt is counted and left where it is", async () => {
    settleStaleAttempt.mockResolvedValue(undefined)
    await expect(expireUnpaidOrders()).resolves.toMatchObject({
      staleAttempts: 1,
    })
    expect(postponeStaleAttempt).not.toHaveBeenCalled()
  })

  test("one that fails is moved behind the others, so it never holds the batch", async () => {
    settleStaleAttempt.mockRejectedValue(new Error("paypal down"))
    await expect(expireUnpaidOrders()).resolves.toMatchObject({
      staleAttempts: 0,
    })
    expect(postponeStaleAttempt).toHaveBeenCalledWith(attempt)
    expect(warn).toHaveBeenCalled()
  })

  test("a postpone that fails too is only logged", async () => {
    settleStaleAttempt.mockRejectedValue(new Error("paypal down"))
    postponeStaleAttempt.mockRejectedValue(new Error("db down"))
    await expect(expireUnpaidOrders()).resolves.toMatchObject({
      staleAttempts: 0,
    })
    expect(warn).toHaveBeenCalledTimes(2)
  })
})
