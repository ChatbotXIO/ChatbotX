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
} = vi.hoisted(() => ({
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

vi.mock("@/features/ads/queries/analytics", () => ({
  getAdsAnalyticsData: mockGetAdsAnalyticsData,
  getCapiDeliveryData: mockGetCapiDeliveryData,
  getAdsAnalyticsTimeseries: mockGetAdsAnalyticsTimeseries,
}))

vi.mock("@chatbotx.io/business", () => ({
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
  AnalyticsNav: () => null,
}))

vi.mock("@/features/ads/components/ads-analytics-view", () => ({
  AdsAnalyticsView: mockAdsAnalyticsView,
}))

const { default: AdsChannelAnalyticsPage } = await import(
  "../src/app/space/[workspaceId]/dashboard/ads/[channel]/page"
)

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

  test("404s for a nonsense channel segment", async () => {
    await expect(
      AdsChannelAnalyticsPage({
        params: Promise.resolve({ workspaceId: "ws-1", channel: "bogus" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("not found")
  })
})
