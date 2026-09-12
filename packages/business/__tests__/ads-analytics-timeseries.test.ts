import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getCtwaFunnelTimeseries: vi.fn(),
  listForChannel: vi.fn(),
  buildFacebookAdsContext: vi.fn(),
  findByWorkspaceId: vi.fn(async () => ({ id: "ifa-1" })),
  runAction: vi.fn(),
  dailyInsightAccountIds: [] as string[],
}))

vi.mock("../src/ads-conversion", () => ({
  adsConversionService: {
    getCtwaFunnelTimeseries: mocks.getCtwaFunnelTimeseries,
  },
  isAdsEligibleChannel: (channel: unknown) =>
    channel === "whatsapp" ||
    channel === "messenger" ||
    channel === "instagram",
}))

vi.mock("../src/messaging-ads-connection/service", () => ({
  messagingAdsConnectionService: {
    listForChannel: mocks.listForChannel,
  },
}))

vi.mock("../src/messaging-ads-connection/graph-reads", () => ({
  listCachedMessagingAdAccounts: vi.fn(),
}))

vi.mock("../src/messaging-ads-connection/context", () => ({
  buildMessagingAdsContext: vi.fn(),
}))

// The union's workspace-wide leg checks for the integration up front
// (absence is a normal state, not a logged failure) — these suites
// exercise the messaging leg, so report it as present.
vi.mock("../src/integration-facebook-ads/service", () => ({
  integrationFacebookAdsService: {
    findByWorkspaceId: mocks.findByWorkspaceId,
  },
}))

vi.mock("../src/integration-facebook-ads/selection", () => ({
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

vi.mock("../src/integration-facebook-ads/graph-reads", () => ({
  buildFacebookAdsContext: mocks.buildFacebookAdsContext,
  getCachedAdAccounts: async (workspaceId: string) => {
    const ctx = await mocks.buildFacebookAdsContext(workspaceId)
    return mocks.runAction("getAdAccounts", { ctx })
  },
  getCachedAdInsights: async () => [],
  getCachedDailyAdInsights: async (input: {
    workspaceId: string
    adAccountId: string
    since: string
    until: string
  }) => {
    const ctx = await mocks.buildFacebookAdsContext(input.workspaceId)
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

vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn() },
}))

const { adsAnalyticsService } = await import("../src/ads-analytics/service")

const RANGE = {
  workspaceId: "ws-1",
  from: "2026-08-01",
  to: "2026-08-03",
  channel: "whatsapp" as const,
}

describe("adsAnalyticsService.getTimeseries", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.dailyInsightAccountIds.length = 0
    mocks.getCtwaFunnelTimeseries.mockResolvedValue([])
    mocks.listForChannel.mockResolvedValue([])
    mocks.findByWorkspaceId.mockResolvedValue({ id: "ifa-1" })
    mocks.buildFacebookAdsContext.mockResolvedValue({ ctx: true })
  })

  test("fills every day in the range with zero counts and null spend when there is no data", async () => {
    // No workspace-wide Facebook Ads integration and no messaging-ads
    // connections for the channel -> the ad-account union is empty.
    mocks.runAction.mockResolvedValue([])

    const result = await adsAnalyticsService.getTimeseries(RANGE)

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

    const result = await adsAnalyticsService.getTimeseries(RANGE)

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

    const result = await adsAnalyticsService.getTimeseries({
      ...RANGE,
      adAccountId: "act_1",
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

  test("falls back to no filter for a stale ad account id (pins getOverview behavior)", async () => {
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

    const result = await adsAnalyticsService.getTimeseries({
      ...RANGE,
      // Valid act_<digits> format but not among the connected accounts.
      adAccountId: "act_999",
    })

    // act_999 doesn't match any connected account, so filterAdAccountsByIds
    // returns [] and adAccountFilterApplied stays false — the funnel row is
    // kept, matching getOverview's existing stale-account fallback.
    expect(mocks.dailyInsightAccountIds).toEqual([])
    expect(result[0]).toMatchObject({ date: "2026-08-01", conversations: 3 })
  })

  test("threads the resolved viewer timezone into the funnel timeseries repository call, defaulting to UTC", async () => {
    mocks.runAction.mockResolvedValue([])

    await adsAnalyticsService.getTimeseries(RANGE)
    expect(mocks.getCtwaFunnelTimeseries).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: "UTC" }),
    )

    vi.clearAllMocks()
    mocks.listForChannel.mockResolvedValue([])
    mocks.runAction.mockResolvedValue([])
    mocks.getCtwaFunnelTimeseries.mockResolvedValue([])

    await adsAnalyticsService.getTimeseries({ ...RANGE, tz: "Asia/Saigon" })
    expect(mocks.getCtwaFunnelTimeseries).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: "Asia/Saigon" }),
    )
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

    const result = await adsAnalyticsService.getTimeseries(RANGE)

    expect(result[0]).toEqual({
      date: "2026-08-01",
      conversations: 3,
      leads: 1,
      purchases: 0,
      spend: null,
    })
  })
})
