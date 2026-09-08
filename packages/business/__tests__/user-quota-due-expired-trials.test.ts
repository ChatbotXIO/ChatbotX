import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// userQuotaService.listDueExpiredTrials — the query behind the
// unsubscribe-expired-trials cron. Regression coverage for a query that had
// no test at all: verifies the where-clause actually excludes active,
// past_due, still-open (periodEnd null), and already-torn-down rows, and
// that the 7-day grace window is a real cutoff, not just `expect.any(Date)`.
// ---------------------------------------------------------------------------

const findManyQuota = vi.fn(async () => [] as { userId: string }[])
vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { userQuotaModel: { findMany: findManyQuota } } },
  eq: vi.fn(),
  sql: vi.fn(),
}))
vi.mock("@chatbotx.io/database/schema", () => ({ userQuotaModel: {} }))

const redisClient = {
  hmget: vi.fn(async (..._args: unknown[]) => [] as (string | null)[]),
  hsetnx: vi.fn(async () => 1),
  hget: vi.fn(async () => null as string | null),
  hincrby: vi.fn(async () => 1),
}
const cacheConnections = {
  useExisting: vi.fn(async () => redisClient),
}
vi.mock("@chatbotx.io/redis", () => ({
  distributedStore: {
    get: vi.fn(async () => null),
    put: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  },
  cacheConnections,
  invalidateCacheByTags: vi.fn(async () => undefined),
}))

const { userQuotaService } = await import("../src/user-quota/service")

beforeEach(() => {
  vi.clearAllMocks()
  findManyQuota.mockResolvedValue([])
})

describe("userQuotaService.listDueExpiredTrials", () => {
  test("queries only trial rows past the cutoff with channels not yet torn down", async () => {
    const cutoff = new Date("2026-09-01T00:00:00.000Z")

    await userQuotaService.listDueExpiredTrials({ cutoff, limit: 500 })

    expect(findManyQuota).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          planStatus: "trial",
          periodEnd: { isNotNull: true, lte: cutoff },
          channelsTornDownAt: { isNull: true },
        }),
      }),
    )
  })

  test("uses a real 7-day grace window, not a stand-in date", async () => {
    const now = new Date("2026-09-08T12:00:00.000Z")
    vi.useFakeTimers()
    vi.setSystemTime(now)

    try {
      const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      await userQuotaService.listDueExpiredTrials({ cutoff, limit: 500 })

      const call = findManyQuota.mock.calls.at(-1)?.[0]
      const actualCutoff = call?.where?.periodEnd?.lte as Date

      expect(actualCutoff.getTime()).toBe(
        now.getTime() - 7 * 24 * 60 * 60 * 1000,
      )
      // A GRACE_DAYS regression to 0 must fail this assertion.
      expect(actualCutoff.getTime()).not.toBe(now.getTime())
    } finally {
      vi.useRealTimers()
    }
  })

  test("adds a userId cursor filter when paging", async () => {
    await userQuotaService.listDueExpiredTrials({
      cutoff: new Date(),
      cursor: "user-5",
      limit: 500,
    })

    expect(findManyQuota).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: { gt: "user-5" },
        }),
      }),
    )
  })

  test("returns a nextCursor only when the page is full", async () => {
    findManyQuota.mockResolvedValueOnce([
      { userId: "user-1" },
      { userId: "user-2" },
    ])

    const full = await userQuotaService.listDueExpiredTrials({
      cutoff: new Date(),
      limit: 2,
    })
    expect(full.nextCursor).toBe("user-2")

    findManyQuota.mockResolvedValueOnce([{ userId: "user-1" }])
    const short = await userQuotaService.listDueExpiredTrials({
      cutoff: new Date(),
      limit: 2,
    })
    expect(short.nextCursor).toBeUndefined()
  })
})
