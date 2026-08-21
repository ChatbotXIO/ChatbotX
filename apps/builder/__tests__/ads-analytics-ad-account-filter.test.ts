// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import { getAdsAnalyticsData } from "../src/features/ads/queries/analytics"

const mocks = vi.hoisted(() => ({
  getCtwaFunnel: vi.fn(),
  findByWorkspaceId: vi.fn(),
  getFacebookAdsContext: vi.fn(),
  runAction: vi.fn(),
  insightAccountIds: [] as string[],
}))

vi.mock("@chatbotx.io/business", () => ({
  adsConversionService: {
    getCtwaFunnel: mocks.getCtwaFunnel,
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
  getCachedAdInsights: async (input: {
    workspaceId: string
    adAccountId: string
    since: string
    until: string
  }) => {
    const ctx = await mocks.getFacebookAdsContext(input.workspaceId)
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

vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn() },
}))

describe("getAdsAnalyticsData ad account filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.insightAccountIds.length = 0
    mocks.getCtwaFunnel.mockResolvedValue({
      totals: { conversations: 0, leads: 0, purchases: 0, revenue: 0 },
      perAd: [],
    })
    mocks.findByWorkspaceId.mockResolvedValue({
      id: "facebook-ads-1",
      workspaceId: "ws-1",
    })
    mocks.getFacebookAdsContext.mockResolvedValue({ ctx: true })
    const actionHandlers = {
      getAdAccounts: async () => [
        { id: "act_1", name: "One" },
        { id: "act_2", name: "Two" },
        { id: "act_3", name: "Three" },
      ],
      getAdInsights: (input: unknown) => {
        const request = input as {
          props: { adAccountId: string; since: string; until: string }
        }
        mocks.insightAccountIds.push(request.props.adAccountId)
        return Promise.resolve([
          {
            ad_id: "ad-1",
            ad_name: "Tracked Ad",
            spend: "12.50",
          },
        ])
      },
    } satisfies Record<string, (input: unknown) => Promise<unknown>>
    mocks.runAction.mockImplementation(
      (action: keyof typeof actionHandlers, input: unknown) =>
        actionHandlers[action](input),
    )
  })

  test("loads insights only for the selected ad account", async () => {
    await getAdsAnalyticsData("ws-1", {
      from: "2026-08-01",
      to: "2026-08-11",
      adAccount: "act_1",
    })

    expect(mocks.insightAccountIds).toEqual(["act_1"])
    expect(mocks.runAction).toHaveBeenCalledWith("getAdInsights", {
      ctx: { ctx: true },
      props: {
        adAccountId: "act_1",
        since: "2026-08-01",
        until: "2026-08-11",
      },
    })
    expect(
      mocks.runAction.mock.calls.filter(
        ([action]) => action === "getAdInsights",
      ),
    ).toHaveLength(1)
  })

  test("fans out to all accounts when the ad account param is malformed", async () => {
    await getAdsAnalyticsData("ws-1", {
      from: "2026-08-01",
      to: "2026-08-11",
      adAccount: "evil/../me",
    })

    expect(mocks.insightAccountIds).toEqual(["act_1", "act_2", "act_3"])
    expect(
      mocks.runAction.mock.calls.filter(
        ([action]) => action === "getAdInsights",
      ),
    ).toHaveLength(3)
  })

  test("keeps funnel-only rows when a stale ad account param is present without Facebook Ads", async () => {
    mocks.findByWorkspaceId.mockResolvedValue(null)
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

    const result = await getAdsAnalyticsData("ws-1", {
      from: "2026-08-01",
      to: "2026-08-11",
      adAccount: "act_1",
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
