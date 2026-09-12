import { beforeEach, describe, expect, test, vi } from "vitest"

// HIGH-4: buildFacebookAdsContext (credential fetch + AES decrypt) must be
// resolved at most once per multi-account fan-out, not once per account.
// Unlike the other analytics test files, the mocked getCachedAdInsights /
// getCachedDailyAdInsights below actually call the `getContext` thunk they
// are given — mirroring the real implementation in
// integration-facebook-ads/graph-reads.ts — so this test can assert the
// memoization the SUT (`ads-analytics/service.ts`) is responsible for.
//
// `messagingAdsConnectionService.listForChannel` resolves to an empty array
// throughout this file — every account here comes from the workspace-wide
// `getCachedAdAccounts` fallback leg of `resolveChannelAdAccountSources`
// (left un-mocked so this test exercises the real union/routing code, not a
// re-implementation of it).
const mocks = vi.hoisted(() => ({
  getCtwaFunnel: vi.fn(),
  getCtwaFunnelTimeseries: vi.fn(),
  listForChannel: vi.fn(),
  buildFacebookAdsContext: vi.fn(),
  getCachedAdAccounts: vi.fn(),
  findByWorkspaceId: vi.fn(async () => ({ id: "ifa-1" })),
  listCachedMessagingAdAccounts: vi.fn(),
  buildMessagingAdsContext: vi.fn(),
}))

vi.mock("../src/ads-conversion", () => ({
  adsConversionService: {
    getCtwaFunnel: mocks.getCtwaFunnel,
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
  listCachedMessagingAdAccounts: mocks.listCachedMessagingAdAccounts,
}))

vi.mock("../src/messaging-ads-connection/context", () => ({
  buildMessagingAdsContext: mocks.buildMessagingAdsContext,
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
  filterAdAccountsByIds: <T>(accounts: T[]) => accounts,
}))

vi.mock("../src/integration-facebook-ads/graph-reads", () => ({
  buildFacebookAdsContext: mocks.buildFacebookAdsContext,
  getCachedAdAccounts: mocks.getCachedAdAccounts,
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

vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn() },
}))

const { adsAnalyticsService } = await import("../src/ads-analytics/service")

describe("analytics context memoization (HIGH-4)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCtwaFunnel.mockResolvedValue({
      totals: { conversations: 0, leads: 0, purchases: 0, revenue: 0 },
      perAd: [],
    })
    mocks.getCtwaFunnelTimeseries.mockResolvedValue([])
    mocks.listForChannel.mockResolvedValue([])
    mocks.findByWorkspaceId.mockResolvedValue({ id: "ifa-1" })
    mocks.getCachedAdAccounts.mockResolvedValue([
      { id: "act_1", name: "One" },
      { id: "act_2", name: "Two" },
      { id: "act_3", name: "Three" },
    ])
    mocks.buildFacebookAdsContext.mockResolvedValue({ ctx: true })
  })

  test("resolves the Facebook Ads context exactly once across a 3-account aggregate fan-out", async () => {
    await adsAnalyticsService.getOverview({
      workspaceId: "ws-1",
      from: "2026-08-01",
      to: "2026-08-11",
      channel: "whatsapp",
    })

    expect(mocks.buildFacebookAdsContext).toHaveBeenCalledTimes(1)
  })

  test("resolves the Facebook Ads context exactly once across a 3-account daily fan-out", async () => {
    await adsAnalyticsService.getTimeseries({
      workspaceId: "ws-1",
      from: "2026-08-01",
      to: "2026-08-03",
      channel: "whatsapp",
    })

    expect(mocks.buildFacebookAdsContext).toHaveBeenCalledTimes(1)
  })

  test("never resolves the context when there is no Facebook Ads integration", async () => {
    mocks.getCachedAdAccounts.mockRejectedValue(
      new Error("no workspace-wide integration"),
    )

    await adsAnalyticsService.getOverview({
      workspaceId: "ws-1",
      from: "2026-08-01",
      to: "2026-08-11",
      channel: "whatsapp",
    })

    expect(mocks.buildFacebookAdsContext).not.toHaveBeenCalled()
  })
})
