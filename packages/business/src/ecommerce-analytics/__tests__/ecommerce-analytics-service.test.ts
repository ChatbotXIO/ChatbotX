import { ECOMMERCE_SETTINGS_DEFAULTS } from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  summary: vi.fn(),
  series: vi.fn(),
  topProducts: vi.fn(),
  topVendors: vi.fn(),
  countOtherCurrencyOrders: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  orderAnalyticsRepository: {
    summary: (...args: unknown[]) => mocks.summary(...args),
    series: (...args: unknown[]) => mocks.series(...args),
    topProducts: (...args: unknown[]) => mocks.topProducts(...args),
    topVendors: (...args: unknown[]) => mocks.topVendors(...args),
    countOtherCurrencyOrders: (...args: unknown[]) =>
      mocks.countOtherCurrencyOrders(...args),
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
  withCache: (_key: string, fn: () => unknown) => fn(),
}))

vi.mock("../../ecommerce-settings/service", () => ({
  ecommerceSettingsService: {
    get: async () => ({
      ...ECOMMERCE_SETTINGS_DEFAULTS,
      payments: { ...ECOMMERCE_SETTINGS_DEFAULTS.payments, currency: "USD" },
    }),
  },
}))

vi.mock("../../workspace/service", () => ({
  workspaceService: {
    findById: async () => ({ id: "ws1", timezone: "Asia/Ho_Chi_Minh" }),
  },
}))

const { ecommerceAnalyticsService, percentChange, rangeBucketKeys } =
  await import("../service")

beforeEach(() => {
  vi.clearAllMocks()
  mocks.series.mockResolvedValue([])
  mocks.topProducts.mockResolvedValue([])
  mocks.topVendors.mockResolvedValue([])
  mocks.countOtherCurrencyOrders.mockResolvedValue(0)
})

describe("percentChange", () => {
  test.each([
    [150, 100, 50],
    [50, 100, -50],
    [0, 0, 0],
    [10, 0, null],
    [1, 3, -66.7],
  ])("%s against %s is %s%", (current, previous, expected) => {
    expect(percentChange(current, previous)).toBe(expected)
  })
})

describe("rangeBucketKeys", () => {
  test("a day is 24 hours", () => {
    const keys = rangeBucketKeys({
      from: "2026-10-21",
      to: "2026-10-21",
      granularity: "hour",
    })
    expect(keys).toHaveLength(24)
    expect(keys[0]).toBe("2026-10-21T00")
    expect(keys[23]).toBe("2026-10-21T23")
  })

  test("a range is every day, across a month end", () => {
    expect(
      rangeBucketKeys({
        from: "2026-10-30",
        to: "2026-11-02",
        granularity: "day",
      }),
    ).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"])
  })
})

describe("ecommerceAnalyticsService.getDashboard", () => {
  test("compares with the period just before, in the workspace timezone", async () => {
    mocks.summary
      .mockResolvedValueOnce({ sales: 1200, orders: 48, products: 99 }) // lifetime
      // Up to the period's end: the 200 sold after it must not count.
      .mockResolvedValueOnce({ sales: 1000, orders: 40, products: 90 })
      .mockResolvedValueOnce({ sales: 150, orders: 3, products: 6 }) // period
      .mockResolvedValueOnce({ sales: 100, orders: 4, products: 6 }) // previous
    const dashboard = await ecommerceAnalyticsService.getDashboard({
      workspaceId: "ws1",
      from: "2026-10-15",
      to: "2026-10-21",
    })

    const [lifetimeScope, untilEndScope, periodScope, previousScope] =
      mocks.summary.mock.calls.map(([scope]) => scope)
    expect(lifetimeScope).toEqual({ workspaceId: "ws1", currency: "USD" })
    expect(untilEndScope).toEqual({
      workspaceId: "ws1",
      currency: "USD",
      until: periodScope.until,
    })
    // Ho Chi Minh is UTC+7: the 15th starts at 17:00 UTC on the 14th.
    expect(periodScope.since.toISOString()).toBe("2026-10-14T17:00:00.000Z")
    // The previous 7 days end just before the period starts.
    expect(previousScope.until.getTime()).toBe(periodScope.since.getTime() - 1)
    expect(previousScope.since.toISOString()).toBe("2026-10-07T17:00:00.000Z")

    expect(dashboard).toMatchObject({
      currency: "USD",
      granularity: "day",
      lifetime: { value: 1200, change: 17.6 },
      sales: { value: 150, change: 50 },
      orders: { value: 3, change: -25 },
      products: { value: 6, change: 0 },
    })
    expect(dashboard.series).toHaveLength(7)
  })

  test("reports the period's orders in other currencies, outside every sum", async () => {
    mocks.summary.mockResolvedValue({ sales: 0, orders: 0, products: 0 })
    mocks.countOtherCurrencyOrders.mockResolvedValue(3)
    const dashboard = await ecommerceAnalyticsService.getDashboard({
      workspaceId: "ws1",
      from: "2026-10-15",
      to: "2026-10-21",
    })
    expect(dashboard.otherCurrencyOrders).toBe(3)
    const [[scope]] = mocks.countOtherCurrencyOrders.mock.calls
    expect(scope).toMatchObject({ workspaceId: "ws1", currency: "USD" })
    expect(scope.since.toISOString()).toBe("2026-10-14T17:00:00.000Z")
  })

  test("one day is charted by hour, the empty hours filled with 0", async () => {
    mocks.summary.mockResolvedValue({ sales: 0, orders: 0, products: 0 })
    mocks.series.mockResolvedValue([
      { key: "2026-10-21T09", sales: 25.5, orders: 2 },
    ])
    const dashboard = await ecommerceAnalyticsService.getDashboard({
      workspaceId: "ws1",
      from: "2026-10-21",
      to: "2026-10-21",
    })
    expect(mocks.series).toHaveBeenCalledWith(
      expect.objectContaining({
        granularity: "hour",
        timezone: "Asia/Ho_Chi_Minh",
      }),
    )
    expect(dashboard.series).toHaveLength(24)
    expect(dashboard.series[9]).toEqual({
      key: "2026-10-21T09",
      sales: 25.5,
      orders: 2,
    })
    expect(dashboard.series[10]).toEqual({
      key: "2026-10-21T10",
      sales: 0,
      orders: 0,
    })
  })
})

describe("ecommerceAnalyticsService.getDashboard defaults", () => {
  test("without dates it is today in the workspace timezone, by hour", async () => {
    mocks.summary.mockResolvedValue({ sales: 0, orders: 0, products: 0 })
    const dashboard = await ecommerceAnalyticsService.getDashboard({
      workspaceId: "ws1",
    })
    expect(dashboard.from).toBe(dashboard.to)
    expect(dashboard.granularity).toBe("hour")
  })
})
