// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockResolveGuardedWorkspaceId,
  mockNotFound,
  mockGetAdsSwitcherData,
  mockGetAdsAnalyticsData,
  mockGetCapiDeliveryData,
  mockGetAdsAnalyticsTimeseries,
  mockAdsAnalyticsView,
  mockAdsReferralStats,
  mockResolveGoogleAdsDashboardEntry,
  mockAnalyticsNav,
} = vi.hoisted(() => ({
  mockResolveGoogleAdsDashboardEntry: vi.fn(async () => true),
  mockAnalyticsNav: vi.fn(() => null),
  mockResolveGuardedWorkspaceId: vi.fn(async () => "ws-1"),
  mockNotFound: vi.fn(() => {
    throw new Error("not found")
  }),
  mockGetAdsSwitcherData: vi.fn(async () => ({
    integrations: [
      {
        id: "iw-1",
        name: "WA Number",
        displayPhoneNumber: "+1 555",
        inboxId: "inbox-1",
        hasCapiScope: true,
      },
    ],
    whatsappCredentialPublic: null,
    oauthCallbackUrl: "https://example.com/oauth",
    messengerIntegrations: [{ id: "msg-1", name: "My Page" }],
    instagramIntegrations: [{ id: "ig-1", name: "My IG" }],
  })),
  mockGetAdsAnalyticsData: vi.fn(async () => ({
    totals: {
      conversations: 0,
      leads: 0,
      purchases: 0,
      revenue: 0,
      spend: 0,
      costPerLead: null,
      costPerPurchase: null,
      roas: null,
      impressions: null,
      clicks: null,
      cpc: null,
      ctr: null,
      cpm: null,
      costPerConversation: null,
    },
    perAd: [],
  })),
  mockGetCapiDeliveryData: vi.fn(async () => ({
    sent: 0,
    pending: 0,
    failed: 0,
    skippedNoScope: 0,
    skippedRegion: 0,
  })),
  mockGetAdsAnalyticsTimeseries: vi.fn(async () => []),
  mockAdsAnalyticsView: vi.fn(() => null),
  mockAdsReferralStats: vi.fn(
    (_props: { range: { from: string; to: string } }) => null,
  ),
}))

vi.mock("@/lib/auth/require-workspace-permission", () => ({
  resolveGuardedWorkspaceId: mockResolveGuardedWorkspaceId,
}))

vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
}))

vi.mock("@/features/ads/queries/switcher", () => ({
  getAdsSwitcherData: mockGetAdsSwitcherData,
}))

vi.mock("@chatbotx.io/business", () => ({
  adsAnalyticsService: {
    getOverview: mockGetAdsAnalyticsData,
    getCapiDelivery: mockGetCapiDeliveryData,
    getTimeseries: mockGetAdsAnalyticsTimeseries,
  },
  perChannelIntegrationIds: (
    channel: string,
    integrationId: string | undefined,
  ) => ({
    integrationWhatsappId: channel === "whatsapp" ? integrationId : undefined,
    integrationMessengerId: channel === "messenger" ? integrationId : undefined,
    integrationInstagramId: channel === "instagram" ? integrationId : undefined,
  }),
  inboxService: {
    distinctConnectedChannels: vi.fn(async () => [
      "whatsapp",
      "messenger",
      "instagram",
    ]),
  },
}))

vi.mock("@/features/analytics/components/analytics-nav", () => ({
  AnalyticsNav: mockAnalyticsNav,
}))

vi.mock("@/features/analytics/lib/google-ads-dashboard-entry", () => ({
  resolveGoogleAdsDashboardEntry: mockResolveGoogleAdsDashboardEntry,
}))

vi.mock("@/features/ads/components/ads-analytics-view", () => ({
  AdsAnalyticsView: mockAdsAnalyticsView,
}))

vi.mock("@/features/ads/components/ads-referral-stats", () => ({
  AdsReferralStats: mockAdsReferralStats,
}))

const { default: AdsChannelAnalyticsPage } = await import(
  "../src/app/space/[workspaceId]/dashboard/ads/[channel]/page"
)

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

describe("Ads dashboard [channel] page", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveGuardedWorkspaceId.mockResolvedValue("ws-1")
    mockGetAdsSwitcherData.mockResolvedValue({
      integrations: [
        {
          id: "iw-1",
          name: "WA Number",
          displayPhoneNumber: "+1 555",
          inboxId: "inbox-1",
          hasCapiScope: true,
        },
      ],
      whatsappCredentialPublic: null,
      oauthCallbackUrl: "https://example.com/oauth",
      messengerIntegrations: [{ id: "msg-1", name: "My Page" }],
      instagramIntegrations: [{ id: "ig-1", name: "My IG" }],
    })
  })

  describe("per-ad referral stats", () => {
    const render = async (searchParams: Record<string, string>) => {
      renderToStaticMarkup(
        await AdsChannelAnalyticsPage({
          params: Promise.resolve({
            workspaceId: "ws-1",
            channel: "messenger",
          }),
          searchParams: Promise.resolve(searchParams),
        }),
      )
    }

    test("is scoped to the channel and the URL's range in the viewer's timezone", async () => {
      await render({ from: "2026-10-01", to: "2026-10-07", tz: "UTC" })

      expect(mockAdsReferralStats).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "messenger",
          workspaceId: "ws-1",
          range: { from: "2026-10-01", to: "2026-10-07", tz: "UTC" },
        }),
        undefined,
      )
    })

    test("gets the same fallback days as the dashboard when the URL range is malformed", async () => {
      await render({ from: "2026-13-45", to: "nonsense", tz: "UTC" })

      const range = mockAdsReferralStats.mock.calls[0]?.[0].range
      expect(range.from).toMatch(DATE_KEY_RE)
      expect(range.to).toMatch(DATE_KEY_RE)
      expect(range.from <= range.to).toBe(true)
    })

    test("is hidden while a single account is selected, since it counts the whole channel", async () => {
      await render({ channelAccount: "msg-1" })

      expect(mockAdsReferralStats).not.toHaveBeenCalled()
    })
  })

  test("renders the view scoped to the messenger channel with only messenger integrations", async () => {
    const element = await AdsChannelAnalyticsPage({
      params: Promise.resolve({ workspaceId: "ws-1", channel: "messenger" }),
      searchParams: Promise.resolve({}),
    })
    renderToStaticMarkup(element)

    expect(mockResolveGuardedWorkspaceId).toHaveBeenCalledWith(
      expect.any(Promise),
      "superAdmin",
    )
    expect(mockAdsAnalyticsView).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "messenger",
        channelIntegrations: [{ id: "msg-1", name: "My Page" }],
        workspaceId: "ws-1",
      }),
      undefined,
    )
  })

  test("renders the view scoped to whatsapp with the phone-labeled integration list", async () => {
    const element = await AdsChannelAnalyticsPage({
      params: Promise.resolve({ workspaceId: "ws-1", channel: "whatsapp" }),
      searchParams: Promise.resolve({}),
    })
    renderToStaticMarkup(element)

    expect(mockAdsAnalyticsView).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "whatsapp",
        channelIntegrations: [{ id: "iw-1", name: "WA Number — +1 555" }],
      }),
      undefined,
    )
  })

  test("404s for a channel that is not ads-eligible", async () => {
    await expect(
      AdsChannelAnalyticsPage({
        params: Promise.resolve({ workspaceId: "ws-1", channel: "facebook" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("not found")

    expect(mockNotFound).toHaveBeenCalled()
  })

  test("404s for google: it is a sibling static route, never a Meta channel", async () => {
    await expect(
      AdsChannelAnalyticsPage({
        params: Promise.resolve({ workspaceId: "ws-1", channel: "google" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("not found")

    expect(mockNotFound).toHaveBeenCalled()
    expect(mockAdsAnalyticsView).not.toHaveBeenCalled()
  })

  test("passes the resolved Google Ads entry flag to the nav", async () => {
    const element = await AdsChannelAnalyticsPage({
      params: Promise.resolve({ workspaceId: "ws-1", channel: "messenger" }),
      searchParams: Promise.resolve({}),
    })
    renderToStaticMarkup(element)

    expect(mockResolveGoogleAdsDashboardEntry).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      isSuperAdmin: true,
    })
    expect(mockAnalyticsNav).toHaveBeenCalledWith(
      expect.objectContaining({ showGoogleAds: true }),
      undefined,
    )
  })

  test("404s for a nonsense channel segment", async () => {
    await expect(
      AdsChannelAnalyticsPage({
        params: Promise.resolve({ workspaceId: "ws-1", channel: "bogus" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("not found")
  })
})
