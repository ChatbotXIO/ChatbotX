import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getCtwaFunnel: vi.fn(),
  resolveChannelAdAccountSources: vi.fn(),
  buildFacebookAdsContext: vi.fn(),
  buildMessagingAdsContext: vi.fn(),
  runAction: vi.fn(),
  insightAccountIds: [] as string[],
}))

vi.mock("../src/ads-conversion", () => ({
  adsConversionService: {
    getCtwaFunnel: mocks.getCtwaFunnel,
  },
  isAdsEligibleChannel: (channel: unknown) =>
    channel === "whatsapp" ||
    channel === "messenger" ||
    channel === "instagram",
}))

vi.mock("../src/messaging-ads-connection/context", () => ({
  buildMessagingAdsContext: mocks.buildMessagingAdsContext,
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

vi.mock("../src/ads-analytics/channel-ad-accounts", () => ({
  resolveChannelAdAccountSources: mocks.resolveChannelAdAccountSources,
}))

vi.mock("../src/integration-facebook-ads/graph-reads", () => ({
  buildFacebookAdsContext: mocks.buildFacebookAdsContext,
  getCachedAdInsights: async (input: {
    workspaceId: string
    adAccountId: string
    since: string
    until: string
    getContext: () => Promise<unknown>
  }) => {
    const ctx = await input.getContext()
    mocks.insightAccountIds.push(input.adAccountId)
    return mocks.runAction("getAdInsights", {
      ctx,
      props: {
        adAccountId: input.adAccountId,
        since: input.since,
        until: input.until,
      },
    })
  },
}))

vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn() },
}))

const { adsAnalyticsService } = await import("../src/ads-analytics/service")

describe("adsAnalyticsService.getOverview ad account filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.insightAccountIds.length = 0
    mocks.getCtwaFunnel.mockResolvedValue({
      totals: { conversations: 0, leads: 0, purchases: 0, revenue: 0 },
      perAd: [],
    })
    mocks.buildFacebookAdsContext.mockResolvedValue({ ctx: "workspace" })
    mocks.buildMessagingAdsContext.mockResolvedValue({ ctx: "messaging" })
    mocks.runAction.mockImplementation(() =>
      Promise.resolve([
        {
          ad_id: "ad-1",
          ad_name: "Tracked Ad",
          spend: "12.50",
        },
      ]),
    )
  })

  test("no eligible channel on the scope -> no ad-account resolution at all (funnel-only)", async () => {
    const result = await adsAnalyticsService.getOverview({
      workspaceId: "ws-1",
      from: "2026-08-01",
      to: "2026-08-11",
      adAccountId: "act_1",
    })

    expect(mocks.resolveChannelAdAccountSources).not.toHaveBeenCalled()
    expect(result.totals.spend).toBe(0)
  })

  test("threads channel + selected integration into the resolver", async () => {
    mocks.resolveChannelAdAccountSources.mockResolvedValue([])

    await adsAnalyticsService.getOverview({
      workspaceId: "ws-1",
      from: "2026-08-01",
      to: "2026-08-11",
      channel: "messenger",
      integrationMessengerId: "im-1",
    })

    expect(mocks.resolveChannelAdAccountSources).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channel: "messenger",
      integrationId: "im-1",
    })
  })

  test("workspace-source accounts fetch insights through buildFacebookAdsContext (backward compat)", async () => {
    mocks.resolveChannelAdAccountSources.mockResolvedValue([
      { id: "act_1", name: "One", sources: [{ kind: "workspace" }] },
    ])

    await adsAnalyticsService.getOverview({
      workspaceId: "ws-1",
      from: "2026-08-01",
      to: "2026-08-11",
      channel: "whatsapp",
      integrationWhatsappId: "iw-1",
    })

    expect(mocks.buildFacebookAdsContext).toHaveBeenCalledWith("ws-1")
    expect(mocks.buildMessagingAdsContext).not.toHaveBeenCalled()
    expect(mocks.insightAccountIds).toEqual(["act_1"])
  })

  test("messaging-source accounts (box-only workspace) fetch insights through buildMessagingAdsContext and still yield spend", async () => {
    mocks.resolveChannelAdAccountSources.mockResolvedValue([
      {
        id: "act_2",
        name: "Box account",
        sources: [{ kind: "messaging", integrationId: "im-1" }],
      },
    ])

    const result = await adsAnalyticsService.getOverview({
      workspaceId: "ws-1",
      from: "2026-08-01",
      to: "2026-08-11",
      channel: "messenger",
    })

    expect(mocks.buildMessagingAdsContext).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channel: "messenger",
      integrationId: "im-1",
    })
    expect(mocks.buildFacebookAdsContext).not.toHaveBeenCalled()
    expect(result.totals.spend).toBeGreaterThan(0)
  })

  test("groups the fan-out by source and memoizes ONE context resolution per source", async () => {
    mocks.resolveChannelAdAccountSources.mockResolvedValue([
      { id: "act_1", name: "One", sources: [{ kind: "workspace" }] },
      { id: "act_2", name: "Two", sources: [{ kind: "workspace" }] },
      {
        id: "act_3",
        name: "Three",
        sources: [{ kind: "messaging", integrationId: "im-1" }],
      },
    ])

    await adsAnalyticsService.getOverview({
      workspaceId: "ws-1",
      from: "2026-08-01",
      to: "2026-08-11",
      channel: "messenger",
    })

    expect(mocks.buildFacebookAdsContext).toHaveBeenCalledTimes(1)
    expect(mocks.buildMessagingAdsContext).toHaveBeenCalledTimes(1)
    expect(mocks.insightAccountIds.sort()).toEqual(["act_1", "act_2", "act_3"])
  })

  test("loads insights only for the selected ad account", async () => {
    mocks.resolveChannelAdAccountSources.mockResolvedValue([
      { id: "act_1", name: "One", sources: [{ kind: "workspace" }] },
      { id: "act_2", name: "Two", sources: [{ kind: "workspace" }] },
      { id: "act_3", name: "Three", sources: [{ kind: "workspace" }] },
    ])

    await adsAnalyticsService.getOverview({
      workspaceId: "ws-1",
      from: "2026-08-01",
      to: "2026-08-11",
      channel: "whatsapp",
      adAccountId: "act_1",
    })

    expect(mocks.insightAccountIds).toEqual(["act_1"])
    expect(mocks.runAction).toHaveBeenCalledTimes(1)
  })

  test("keeps funnel-only rows when the resolver returns null (e.g. account list failed to load)", async () => {
    mocks.resolveChannelAdAccountSources.mockRejectedValue(new Error("boom"))
    mocks.getCtwaFunnel.mockResolvedValue({
      totals: { conversations: 2, leads: 1, purchases: 0, revenue: 0 },
      perAd: [
        {
          adId: "ad-funnel-only",
          conversations: 2,
          leads: 1,
          purchases: 0,
          revenue: 0,
        },
      ],
    })

    const result = await adsAnalyticsService.getOverview({
      workspaceId: "ws-1",
      from: "2026-08-01",
      to: "2026-08-11",
      channel: "whatsapp",
      adAccountId: "act_1",
    })

    expect(mocks.insightAccountIds).toEqual([])
    expect(result.totals.conversations).toBe(2)
    expect(result.totals.leads).toBe(1)
    expect(result.perAd).toEqual([
      expect.objectContaining({
        adId: "ad-funnel-only",
        spend: null,
        conversations: 2,
      }),
    ])
  })
})
