// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import { getAdsAnalyticsTimeseries } from "../src/features/ads/queries/analytics"

const mocks = vi.hoisted(() => ({
  getCtwaFunnelTimeseries: vi.fn(),
  findByWorkspaceId: vi.fn(),
  getFacebookAdsContext: vi.fn(),
  runAction: vi.fn(),
  dailyInsightAccountIds: [] as string[],
}))

vi.mock("@chatbotx.io/business", () => ({
  adsConversionService: {
    getCtwaFunnelTimeseries: mocks.getCtwaFunnelTimeseries,
  },
  integrationFacebookAdsService: {
    findByWorkspaceId: mocks.findByWorkspaceId,
  },
  filterAdAccountsByIds: <T extends { id: string }>(
    accounts: T[],
    selectedIds: string[] | null | undefined,
  ) => {
    if (!selectedIds?.length) {
      return accounts
    }

    const selectedIdSet = new Set(selectedIds)
    return accounts.filter((account) => selectedIdSet.has(account.id))
  },
}))

vi.mock("@chatbotx.io/integration-facebook-ads", () => ({
  integration: {
    runAction: mocks.runAction,
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: (_key: string, loader: () => Promise<unknown>) => loader(),
}))

vi.mock("@/features/integration-facebook-ads/queries", () => ({
  getFacebookAdsContext: mocks.getFacebookAdsContext,
  getCachedAdAccounts: async (workspaceId: string) => {
    const ctx = await mocks.getFacebookAdsContext(workspaceId)
    return mocks.runAction("getAdAccounts", { ctx })
  },
  getCachedAdInsights: async () => [],
  getCachedDailyAdInsights: async (input: {
    workspaceId: string
    adAccountId: string
    since: string
    until: string
  }) => {
    const ctx = await mocks.getFacebookAdsContext(input.workspaceId)
    mocks.dailyInsightAccountIds.push(input.adAccountId)
    return mocks.runAction("getAdInsights", {
      ctx,
      props: {
        adAccountId: input.adAccountId,
        since: input.since,
        until: input.until,
        timeIncrement: 1,
      },
    })
  },
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn() },
}))

const RANGE = { from: "2026-08-01", to: "2026-08-03" }

describe("getAdsAnalyticsTimeseries", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.dailyInsightAccountIds.length = 0
    mocks.getCtwaFunnelTimeseries.mockResolvedValue([])
    mocks.findByWorkspaceId.mockResolvedValue({
      id: "facebook-ads-1",
      workspaceId: "ws-1",
    })
    mocks.getFacebookAdsContext.mockResolvedValue({ ctx: true })
  })

  test("fills every day in the range with zero counts and null spend when there is no data", async () => {
    mocks.findByWorkspaceId.mockResolvedValue(null)

    const result = await getAdsAnalyticsTimeseries("ws-1", RANGE)

    expect(result).toEqual([
      {
        date: "2026-08-01",
        conversations: 0,
        leads: 0,
        purchases: 0,
        spend: null,
      },
      {
        date: "2026-08-02",
        conversations: 0,
        leads: 0,
        purchases: 0,
        spend: null,
      },
      {
        date: "2026-08-03",
        conversations: 0,
        leads: 0,
        purchases: 0,
        spend: null,
      },
    ])
  })

  test("keeps all funnel rows and sums spend across every connected account when no ad account filter is set", async () => {
    mocks.getCtwaFunnelTimeseries.mockResolvedValue([
      {
        date: "2026-08-01",
        adId: "ad-1",
        conversations: 3,
        leads: 1,
        purchases: 0,
      },
      {
        date: "2026-08-02",
        adId: "ad-2",
        conversations: 2,
        leads: 0,
        purchases: 1,
      },
    ])
    const actionHandlers = {
      getAdAccounts: async () => [
        { id: "act_1", name: "One" },
        { id: "act_2", name: "Two" },
      ],
      getAdInsights: (input: unknown) => {
        const request = input as { props: { adAccountId: string } }
        if (request.props.adAccountId === "act_1") {
          return Promise.resolve([
            { ad_id: "ad-1", spend: 10, date_start: "2026-08-01" },
          ])
        }
        return Promise.resolve([
          { ad_id: "ad-2", spend: 5, date_start: "2026-08-02" },
        ])
      },
    } satisfies Record<string, (input: unknown) => Promise<unknown>>
    mocks.runAction.mockImplementation(
      (action: keyof typeof actionHandlers, input: unknown) =>
        actionHandlers[action](input),
    )

    const result = await getAdsAnalyticsTimeseries("ws-1", RANGE)

    expect(mocks.dailyInsightAccountIds.sort()).toEqual(["act_1", "act_2"])
    expect(result).toEqual([
      {
        date: "2026-08-01",
        conversations: 3,
        leads: 1,
        purchases: 0,
        spend: 10,
      },
      {
        date: "2026-08-02",
        conversations: 2,
        leads: 0,
        purchases: 1,
        spend: 5,
      },
      {
        date: "2026-08-03",
        conversations: 0,
        leads: 0,
        purchases: 0,
        spend: null,
      },
    ])
  })

  test("drops funnel rows for ads outside the selected ad account (survivor filter matches mergeAdsAnalytics)", async () => {
    mocks.getCtwaFunnelTimeseries.mockResolvedValue([
      {
        date: "2026-08-01",
        adId: "ad-1",
        conversations: 3,
        leads: 1,
        purchases: 0,
      },
      {
        date: "2026-08-01",
        adId: "ad-other-account",
        conversations: 9,
        leads: 9,
        purchases: 9,
      },
    ])
    const actionHandlers = {
      getAdAccounts: async () => [
        { id: "act_1", name: "One" },
        { id: "act_2", name: "Two" },
      ],
      getAdInsights: (_input: unknown) =>
        Promise.resolve([
          { ad_id: "ad-1", spend: 10, date_start: "2026-08-01" },
        ]),
    } satisfies Record<string, (input: unknown) => Promise<unknown>>
    mocks.runAction.mockImplementation(
      (action: keyof typeof actionHandlers, input: unknown) =>
        actionHandlers[action](input),
    )

    const result = await getAdsAnalyticsTimeseries("ws-1", {
      ...RANGE,
      adAccount: "act_1",
    })

    expect(mocks.dailyInsightAccountIds).toEqual(["act_1"])
    expect(result[0]).toEqual({
      date: "2026-08-01",
      conversations: 3,
      leads: 1,
      purchases: 0,
      spend: 10,
    })
  })

  test("falls back to no filter for a stale ad account id (pins getAdsAnalyticsData behavior)", async () => {
    mocks.getCtwaFunnelTimeseries.mockResolvedValue([
      {
        date: "2026-08-01",
        adId: "ad-1",
        conversations: 3,
        leads: 1,
        purchases: 0,
      },
    ])
    mocks.runAction.mockImplementation((action: string) => {
      if (action === "getAdAccounts") {
        return Promise.resolve([{ id: "act_1", name: "One" }])
      }
      return Promise.resolve([])
    })

    const result = await getAdsAnalyticsTimeseries("ws-1", {
      ...RANGE,
      // Valid act_<digits> format but not among the connected accounts.
      adAccount: "act_999",
    })

    // act_999 doesn't match any connected account, so filterAdAccountsByIds
    // returns [] and adAccountFilterApplied stays false — the funnel row is
    // kept, matching getAdsAnalyticsData's existing stale-account fallback.
    expect(mocks.dailyInsightAccountIds).toEqual([])
    expect(result[0]).toMatchObject({ date: "2026-08-01", conversations: 3 })
  })

  test("keeps funnel data and sets spend null when Meta insights fail to load", async () => {
    mocks.getCtwaFunnelTimeseries.mockResolvedValue([
      {
        date: "2026-08-01",
        adId: "ad-1",
        conversations: 3,
        leads: 1,
        purchases: 0,
      },
    ])
    mocks.runAction.mockImplementation((action: string) => {
      if (action === "getAdAccounts") {
        return Promise.resolve([{ id: "act_1", name: "One" }])
      }
      return Promise.reject(new Error("Meta down"))
    })

    const result = await getAdsAnalyticsTimeseries("ws-1", RANGE)

    expect(result[0]).toEqual({
      date: "2026-08-01",
      conversations: 3,
      leads: 1,
      purchases: 0,
      spend: null,
    })
  })
})
