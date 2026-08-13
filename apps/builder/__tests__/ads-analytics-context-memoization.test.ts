// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import {
  getAdsAnalyticsData,
  getAdsAnalyticsTimeseries,
} from "../src/features/ads/queries/analytics"

// HIGH-4: getFacebookAdsContext (credential fetch + AES decrypt) must be
// resolved at most once per multi-account fan-out, not once per account.
// Unlike the other analytics test files, the mocked getCachedAdInsights /
// getCachedDailyAdInsights below actually call the `getContext` thunk they
// are given — mirroring the real implementation in
// integration-facebook-ads/queries.ts — so this test can assert the
// memoization the SUT (`analytics.ts`) is responsible for.
const mocks = vi.hoisted(() => ({
  getCtwaFunnel: vi.fn(),
  getCtwaFunnelTimeseries: vi.fn(),
  findByWorkspaceId: vi.fn(),
  getFacebookAdsContext: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  adsConversionService: {
    getCtwaFunnel: mocks.getCtwaFunnel,
    getCtwaFunnelTimeseries: mocks.getCtwaFunnelTimeseries,
  },
  integrationFacebookAdsService: {
    findByWorkspaceId: mocks.findByWorkspaceId,
  },
  filterAdAccountsByIds: <T extends { id: string }>(accounts: T[]) => accounts,
}))

vi.mock("@/features/integration-facebook-ads/queries", () => ({
  getFacebookAdsContext: mocks.getFacebookAdsContext,
  getCachedAdAccounts: async () => [
    { id: "act_1", name: "One" },
    { id: "act_2", name: "Two" },
    { id: "act_3", name: "Three" },
  ],
  getCachedAdInsights: async (input: {
    adAccountId: string
    getContext: () => Promise<unknown>
  }) => {
    await input.getContext()
    return [{ ad_id: `ad-${input.adAccountId}`, spend: "1.00" }]
  },
  getCachedDailyAdInsights: async (input: {
    adAccountId: string
    getContext: () => Promise<unknown>
  }) => {
    await input.getContext()
    return [
      {
        ad_id: `ad-${input.adAccountId}`,
        spend: 1,
        date_start: "2026-08-01",
      },
    ]
  },
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn() },
}))

describe("analytics context memoization (HIGH-4)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCtwaFunnel.mockResolvedValue({
      totals: { conversations: 0, leads: 0, purchases: 0, revenue: 0 },
      perAd: [],
    })
    mocks.getCtwaFunnelTimeseries.mockResolvedValue([])
    mocks.findByWorkspaceId.mockResolvedValue({
      id: "facebook-ads-1",
      workspaceId: "ws-1",
    })
    mocks.getFacebookAdsContext.mockResolvedValue({ ctx: true })
  })

  test("resolves the Facebook Ads context exactly once across a 3-account aggregate fan-out", async () => {
    await getAdsAnalyticsData("ws-1", {
      from: "2026-08-01",
      to: "2026-08-11",
    })

    expect(mocks.getFacebookAdsContext).toHaveBeenCalledTimes(1)
  })

  test("resolves the Facebook Ads context exactly once across a 3-account daily fan-out", async () => {
    await getAdsAnalyticsTimeseries("ws-1", {
      from: "2026-08-01",
      to: "2026-08-03",
    })

    expect(mocks.getFacebookAdsContext).toHaveBeenCalledTimes(1)
  })

  test("never resolves the context when there is no Facebook Ads integration", async () => {
    mocks.findByWorkspaceId.mockResolvedValue(null)

    await getAdsAnalyticsData("ws-1", { from: "2026-08-01", to: "2026-08-11" })

    expect(mocks.getFacebookAdsContext).not.toHaveBeenCalled()
  })
})
