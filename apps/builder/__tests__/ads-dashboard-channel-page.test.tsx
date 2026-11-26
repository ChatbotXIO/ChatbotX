// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockResolveGuardedWorkspaceId,
  mockNotFound,
  mockRedirect,
  mockGetAdsSwitcherData,
  mockGetAdsAnalyticsData,
  mockGetCapiDeliveryData,
  mockGetAdsAnalyticsTimeseries,
  mockAdsAnalyticsView,
  mockAdsReferralStats,
} = vi.hoisted(() => ({
  mockResolveGuardedWorkspaceId: vi.fn(async () => "ws-1"),
  mockNotFound: vi.fn(() => {
    throw new Error("not found")
  }),
  mockRedirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`)
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
    messengerIntegrations: [
      { id: "msg-1", name: "My Page", inboxId: "inbox-msg-1" },
      { id: "msg-2", name: "Other Page", inboxId: "inbox-msg-2" },
    ],
    instagramIntegrations: [
      { id: "ig-1", name: "My IG", inboxId: "inbox-ig-1" },
    ],
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
  redirect: mockRedirect,
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
  inboxService: {
    distinctConnectedChannels: vi.fn(async () => [
      "whatsapp",
      "messenger",
      "instagram",
    ]),
  },
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
      messengerIntegrations: [
        { id: "msg-1", name: "My Page", inboxId: "inbox-msg-1" },
        { id: "msg-2", name: "Other Page", inboxId: "inbox-msg-2" },
      ],
      instagramIntegrations: [
        { id: "ig-1", name: "My IG", inboxId: "inbox-ig-1" },
      ],
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
      await render({ inboxIds: "inbox-msg-1" })

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
        workspaceId: "ws-1",
        selectedChannelIntegrationId: null,
        selectedChannelIntegrationIds: [],
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
      }),
      undefined,
    )
  })

  describe("integration scope from the shared Inbox filter", () => {
    const renderMessenger = async (searchParams: Record<string, string>) => {
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
    const scopeOf = () =>
      (mockGetAdsAnalyticsData.mock.calls as unknown as unknown[][])[0]?.[0]

    test("no inbox selected aggregates every account of the channel", async () => {
      await renderMessenger({})

      expect(scopeOf()).toEqual(
        expect.objectContaining({
          channel: "messenger",
          integrationIds: undefined,
        }),
      )
    })

    test("selected inboxes map to this channel's integrations, all of them aggregated", async () => {
      await renderMessenger({ inboxIds: "inbox-msg-1,inbox-msg-2" })

      expect(scopeOf()).toEqual(
        expect.objectContaining({ integrationIds: ["msg-1", "msg-2"] }),
      )
      expect(mockAdsAnalyticsView).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedChannelIntegrationId: null,
          selectedChannelIntegrationIds: ["msg-1", "msg-2"],
        }),
        undefined,
      )
    })

    test("one selected inbox narrows to its integration", async () => {
      await renderMessenger({ inboxIds: "inbox-msg-2" })

      expect(mockAdsAnalyticsView).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedChannelIntegrationId: "msg-2",
          selectedChannelIntegrationIds: ["msg-2"],
        }),
        undefined,
      )
    })

    test("inboxes of other channels are dropped from a mixed selection", async () => {
      await renderMessenger({ inboxIds: "inbox-1,inbox-msg-2" })

      expect(scopeOf()).toEqual(
        expect.objectContaining({
          integrationIds: ["msg-2"],
          matchesNoIntegration: false,
        }),
      )
    })

    test("an explicit selection that matches no integration (a disconnected inbox bookmark) is empty, never all accounts", async () => {
      await renderMessenger({ inboxIds: "inbox-disconnected" })

      expect(scopeOf()).toEqual(
        expect.objectContaining({
          integrationIds: undefined,
          matchesNoIntegration: true,
        }),
      )
      expect(mockAdsAnalyticsView).toHaveBeenCalledWith(
        expect.objectContaining({
          matchesNoIntegration: true,
          selectedChannelIntegrationId: null,
          selectedChannelIntegrationIds: [],
        }),
        undefined,
      )
      expect(mockAdsReferralStats).not.toHaveBeenCalled()
    })

    test("only other channels' inboxes selected is also empty", async () => {
      await renderMessenger({ inboxIds: "inbox-ig-1" })

      expect(scopeOf()).toEqual(
        expect.objectContaining({ matchesNoIntegration: true }),
      )
    })

    test("the shared channel picker does not change the section's channel", async () => {
      await renderMessenger({ channels: "whatsapp" })

      expect(scopeOf()).toEqual(
        expect.objectContaining({ channel: "messenger" }),
      )
    })

    test("the legacy channelAccount link becomes the shared inbox selection (visible in the row) and leaves the URL", async () => {
      await expect(
        renderMessenger({ channelAccount: "msg-2", from: "2026-10-01" }),
      ).rejects.toThrow(
        "redirect:/space/ws-1/dashboard/ads/messenger?from=2026-10-01&inboxIds=inbox-msg-2",
      )
    })

    test("a selected inbox wins over the legacy channelAccount link (no redirect)", async () => {
      await renderMessenger({
        inboxIds: "inbox-msg-1",
        channelAccount: "msg-2",
      })

      expect(mockRedirect).not.toHaveBeenCalled()
      expect(scopeOf()).toEqual(
        expect.objectContaining({ integrationIds: ["msg-1"] }),
      )
    })

    test("a legacy link naming an integration that no longer exists is ignored", async () => {
      await renderMessenger({ channelAccount: "msg-gone" })

      expect(mockRedirect).not.toHaveBeenCalled()
      expect(scopeOf()).toEqual(
        expect.objectContaining({ integrationIds: undefined }),
      )
    })

    test("whatsapp maps its inbox and still honours the legacy account param", async () => {
      renderToStaticMarkup(
        await AdsChannelAnalyticsPage({
          params: Promise.resolve({ workspaceId: "ws-1", channel: "whatsapp" }),
          searchParams: Promise.resolve({ inboxIds: "inbox-1" }),
        }),
      )
      expect(scopeOf()).toEqual(
        expect.objectContaining({
          channel: "whatsapp",
          integrationIds: ["iw-1"],
        }),
      )
    })
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

  test("404s for a nonsense channel segment", async () => {
    await expect(
      AdsChannelAnalyticsPage({
        params: Promise.resolve({ workspaceId: "ws-1", channel: "bogus" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("not found")
  })
})
