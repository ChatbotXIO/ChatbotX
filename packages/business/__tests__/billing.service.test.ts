import { beforeEach, describe, expect, test, vi } from "vitest"

// --- Mocks ---------------------------------------------------------------

const findFirst = vi.fn(async () => undefined as unknown)
const returning = vi.fn(async () => [{ id: "bill-1", userId: "u-1" }])
const values = vi.fn(() => ({ returning }))
const insert = vi.fn(() => ({ values }))

const db = {
  query: { billingModel: { findFirst } },
  insert,
}
vi.mock("@chatbotx.io/database/client", () => ({ db }))
vi.mock("@chatbotx.io/database/schema", () => ({ billingModel: {} }))
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(async () => undefined),
}))

const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
vi.mock("../src/logger", () => ({ logger }))

const { billingService } = await import("../src/billing/service")

// --- Fixtures ------------------------------------------------------------

beforeEach(() => {
  findFirst.mockReset().mockResolvedValue(undefined)
  returning.mockReset().mockResolvedValue([{ id: "bill-1", userId: "u-1" }])
  values.mockClear()
  insert.mockClear()
  logger.info.mockClear()
  logger.error.mockClear()
})

// --- Tests ---------------------------------------------------------------

describe("BillingService.find", () => {
  test("queries billingModel by userId", async () => {
    findFirst.mockResolvedValue({ id: "bill-9", userId: "u-1" })

    const row = await billingService.find({ userId: "u-1" })

    expect(findFirst).toHaveBeenCalledWith({ where: { userId: "u-1" } })
    expect(row).toEqual({ id: "bill-9", userId: "u-1" })
  })
})

describe("BillingService.ensureForUser", () => {
  test("inserts a Billing row when none exists", async () => {
    findFirst.mockResolvedValue(undefined)

    const row = await billingService.ensureForUser({ userId: "u-1" })

    expect(insert).toHaveBeenCalledTimes(1)
    expect(row).toEqual({ id: "bill-1", userId: "u-1" })
    expect(logger.info).toHaveBeenCalled()
  })

  test("returns the existing row without inserting", async () => {
    findFirst.mockResolvedValue({ id: "bill-existing", userId: "u-1" })

    const row = await billingService.ensureForUser({ userId: "u-1" })

    expect(insert).not.toHaveBeenCalled()
    expect(row).toEqual({ id: "bill-existing", userId: "u-1" })
  })

  test("anchors periodStart truncated to the minute", async () => {
    findFirst.mockResolvedValue(undefined)

    await billingService.ensureForUser({ userId: "u-1" })

    const inserted = values.mock.calls[0]?.[0] as {
      periodStart: Date
      status: string
    }
    expect(inserted.periodStart.getSeconds()).toBe(0)
    expect(inserted.periodStart.getMilliseconds()).toBe(0)
    expect(inserted.status).toBe("active")
  })
})

describe("BillingService — transaction client", () => {
  test("ensureForUser writes through the provided tx, not the default db", async () => {
    const txReturning = vi.fn(async () => [{ id: "bill-tx", userId: "u-1" }])
    const txValues = vi.fn(() => ({ returning: txReturning }))
    const txInsert = vi.fn(() => ({ values: txValues }))
    const txFindFirst = vi.fn(async () => undefined as unknown)
    const tx = {
      query: { billingModel: { findFirst: txFindFirst } },
      insert: txInsert,
    } as never

    const row = await billingService.ensureForUser({ userId: "u-1", tx })

    expect(txInsert).toHaveBeenCalledTimes(1)
    expect(insert).not.toHaveBeenCalled() // default db untouched
    expect(row).toEqual({ id: "bill-tx", userId: "u-1" })
  })
})

describe("BillingService.ensureForUserSafe", () => {
  test("swallows and logs a failure instead of throwing", async () => {
    findFirst.mockRejectedValue(new Error("db down"))

    await expect(
      billingService.ensureForUserSafe({ userId: "u-1" }),
    ).resolves.toBeUndefined()

    expect(logger.error).toHaveBeenCalled()
  })

  test("succeeds silently when ensureForUser resolves", async () => {
    findFirst.mockResolvedValue(undefined)

    await billingService.ensureForUserSafe({ userId: "u-1" })

    expect(insert).toHaveBeenCalledTimes(1)
    expect(logger.error).not.toHaveBeenCalled()
  })
})
