// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import {
  getAdsAnalyticsData,
  getAdsAnalyticsTimeseries,
  getCapiDeliveryData,
} from "@/features/ads/queries/analytics"

const mocks = vi.hoisted(() => ({
  getCtwaFunnel: vi.fn(),
  getCtwaFunnelTimeseries: vi.fn(),
  getCapiDeliverySummary: vi.fn(),
  findByWorkspaceId: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  adsConversionService: {
    getCtwaFunnel: mocks.getCtwaFunnel,
    getCtwaFunnelTimeseries: mocks.getCtwaFunnelTimeseries,
    getCapiDeliverySummary: mocks.getCapiDeliverySummary,
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

vi.mock("@chatbotx.io/redis", () => ({
  withCache: (_key: string, loader: () => Promise<unknown>) => loader(),
}))

vi.mock("@/features/integration-facebook-ads/queries", () => ({
  getFacebookAdsContext: vi.fn().mockResolvedValue({ ctx: true }),
  getCachedAdAccounts: async () => [],
  getCachedAdInsights: async () => [],
  getCachedDailyAdInsights: async () => [],
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn() },
}))

const RANGE = { from: "2026-08-01", to: "2026-08-03" }

describe("ads analytics channel widening (Phase 6)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findByWorkspaceId.mockResolvedValue(null)
    mocks.getCtwaFunnel.mockResolvedValue({
      totals: { conversations: 0, leads: 0, purchases: 0, revenue: 0 },
      perAd: [],
    })
    mocks.getCtwaFunnelTimeseries.mockResolvedValue([])
    mocks.getCapiDeliverySummary.mockResolvedValue({
      sent: 0,
      pending: 0,
      failed: 0,
      skippedNoScope: 0,
      skippedRegion: 0,
    })
  })

  test("getAdsAnalyticsData threads channel + integrationMessengerId into getCtwaFunnel", async () => {
    await getAdsAnalyticsData("ws-1", {
      ...RANGE,
      channel: "messenger",
      integrationMessengerId: "msg-1",
    })

    expect(mocks.getCtwaFunnel).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        channel: "messenger",
        integrationMessengerId: "msg-1",
        integrationWhatsappId: undefined,
        integrationInstagramId: undefined,
      }),
    )
  })

  test("getAdsAnalyticsData treats a messenger/instagram integration selection as an active integration filter", async () => {
    mocks.getCtwaFunnel.mockResolvedValue({
      totals: { conversations: 2, leads: 1, purchases: 0, revenue: 0 },
      perAd: [
        {
          adId: "ad-spend-only",
          conversations: 0,
          leads: 0,
          purchases: 0,
          revenue: 0,
        },
        {
          adId: "ad-messenger-1",
          conversations: 2,
          leads: 1,
          purchases: 0,
          revenue: 0,
        },
      ],
    })

    const result = await getAdsAnalyticsData("ws-1", {
      ...RANGE,
      channel: "instagram",
      integrationInstagramId: "ig-1",
    })

    // integrationFilterActive drops the zero-activity "ad-spend-only" row —
    // same survivor semantics whatsapp already had, now also reachable via
    // integrationInstagramId/integrationMessengerId alone.
    expect(result.perAd.map((row) => row.adId)).toEqual(["ad-messenger-1"])
  })

  test("getCapiDeliveryData threads channel + integrationInstagramId into getCapiDeliverySummary", async () => {
    await getCapiDeliveryData("ws-1", {
      ...RANGE,
      channel: "instagram",
      integrationInstagramId: "ig-1",
    })

    expect(mocks.getCapiDeliverySummary).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        channel: "instagram",
        integrationInstagramId: "ig-1",
      }),
    )
  })

  test("getAdsAnalyticsTimeseries threads channel + integrationMessengerId into getCtwaFunnelTimeseries", async () => {
    await getAdsAnalyticsTimeseries("ws-1", {
      ...RANGE,
      channel: "messenger",
      integrationMessengerId: "msg-1",
    })

    expect(mocks.getCtwaFunnelTimeseries).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        channel: "messenger",
        integrationMessengerId: "msg-1",
      }),
    )
  })

  test("omitting channel/integration fields keeps the pre-Phase-6 whatsapp-only call shape", async () => {
    await getAdsAnalyticsData("ws-1", RANGE)

    expect(mocks.getCtwaFunnel).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        channel: undefined,
        integrationWhatsappId: undefined,
        integrationMessengerId: undefined,
        integrationInstagramId: undefined,
      }),
    )
  })
})

describe("ads analytics 'All channels' aggregation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findByWorkspaceId.mockResolvedValue(null)
    mocks.getCtwaFunnel.mockResolvedValue({
      totals: { conversations: 0, leads: 0, purchases: 0, revenue: 0 },
      perAd: [],
    })
    mocks.getCtwaFunnelTimeseries.mockResolvedValue([])
    mocks.getCapiDeliverySummary.mockResolvedValue({
      sent: 0,
      pending: 0,
      failed: 0,
      skippedNoScope: 0,
      skippedRegion: 0,
    })
  })

  test("getAdsAnalyticsData threads allChannels into getCtwaFunnel with no channel/integration ids", async () => {
    await getAdsAnalyticsData("ws-1", { ...RANGE, allChannels: true })

    expect(mocks.getCtwaFunnel).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        allChannels: true,
        channel: undefined,
        integrationWhatsappId: undefined,
        integrationMessengerId: undefined,
        integrationInstagramId: undefined,
      }),
    )
  })

  test("getCapiDeliveryData threads allChannels into getCapiDeliverySummary", async () => {
    await getCapiDeliveryData("ws-1", { ...RANGE, allChannels: true })

    expect(mocks.getCapiDeliverySummary).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", allChannels: true }),
    )
  })

  test("getAdsAnalyticsTimeseries threads allChannels into getCtwaFunnelTimeseries", async () => {
    await getAdsAnalyticsTimeseries("ws-1", { ...RANGE, allChannels: true })

    expect(mocks.getCtwaFunnelTimeseries).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", allChannels: true }),
    )
  })

  test("does not set integrationFilterActive under allChannels (no single integration is selected)", async () => {
    mocks.getCtwaFunnel.mockResolvedValue({
      totals: { conversations: 2, leads: 1, purchases: 0, revenue: 0 },
      perAd: [
        {
          adId: "ad-mixed",
          conversations: 2,
          leads: 1,
          purchases: 0,
          revenue: 0,
          channels: ["messenger", "instagram"],
        },
      ],
    })

    const result = await getAdsAnalyticsData("ws-1", {
      ...RANGE,
      allChannels: true,
    })

    // Under allChannels every integration id is undefined, so the
    // integration-filter survivor semantics (which drop zero-activity rows)
    // must NOT kick in — the row survives regardless of activity.
    expect(result.perAd.map((row) => row.adId)).toContain("ad-mixed")
    expect(result.perAd[0]?.channels).toEqual(["messenger", "instagram"])
  })
})
