// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  resolveGuardedWorkspaceId: vi.fn(async () => "ws-1"),
  notFound: vi.fn(() => {
    throw new Error("not found")
  }),
  getStats: vi.fn(),
  hasAnyEvent: vi.fn(),
  getSetup: vi.fn(),
  getConversionReport: vi.fn(),
  findWorkspace: vi.fn(),
  distinctConnectedChannels: vi.fn(async () => ["whatsapp"]),
  view: vi.fn(() => null),
  nav: vi.fn(() => null),
}))

vi.mock("@/lib/auth/require-workspace-permission", () => ({
  resolveGuardedWorkspaceId: mocks.resolveGuardedWorkspaceId,
}))
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }))
vi.mock("@chatbotx.io/business", () => ({
  googleAdsConversionService: {
    getStats: mocks.getStats,
    hasAnyEvent: mocks.hasAnyEvent,
  },
  integrationGoogleAdsService: {
    getSetup: mocks.getSetup,
    getConversionReport: mocks.getConversionReport,
  },
  workspaceService: { findById: mocks.findWorkspace },
  inboxService: { distinctConnectedChannels: mocks.distinctConnectedChannels },
}))
vi.mock("@/features/analytics/components/analytics-nav", () => ({
  AnalyticsNav: mocks.nav,
}))
vi.mock(
  "@/features/integration-google-ads/components/stats/google-ads-stats-view",
  () => ({ GoogleAdsStatsView: mocks.view }),
)

const { default: GoogleAdsStatsPage } = await import(
  "../src/app/space/[workspaceId]/dashboard/ads/google/page"
)
const { googleAdsStatsSearchParamsCache } = await import(
  "@/features/integration-google-ads/schema/stats-search-params"
)

const ISO_INSTANT = /^\d{4}-\d\d-\d\dT/
const createdAt = new Date("2026-01-01T00:00:00Z")
const stats = { range: { from: "a", to: "b", tz: "UTC" } }

const render = async (searchParams: Record<string, string> = {}) => {
  const element = await GoogleAdsStatsPage({
    params: Promise.resolve({ workspaceId: "ws-1" }),
    searchParams: Promise.resolve(searchParams),
  })
  renderToStaticMarkup(element)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveGuardedWorkspaceId.mockResolvedValue("ws-1")
  mocks.getStats.mockResolvedValue(stats)
  mocks.getConversionReport.mockResolvedValue({
    status: "ok",
    total: 0,
    byAction: [],
  })
  mocks.getSetup.mockResolvedValue({
    integration: {
      conversionActions: [{ id: "111", name: "Purchase", category: "X" }],
    },
  })
  mocks.findWorkspace.mockResolvedValue({ id: "ws-1", createdAt })
  mocks.hasAnyEvent.mockResolvedValue(false)
})

describe("googleAdsStatsSearchParamsCache", () => {
  test("empty params default to empty strings and no filters, with no date computed at import", () => {
    expect(googleAdsStatsSearchParamsCache.parse({})).toEqual({
      from: "",
      to: "",
      tz: "",
      channel: null,
      action: null,
    })
  })

  test("keeps valid values", () => {
    expect(
      googleAdsStatsSearchParamsCache.parse({
        from: "2026-09-01",
        to: "2026-09-07",
        tz: "Asia/Ho_Chi_Minh",
        channel: "messenger",
        action: "123456",
      }),
    ).toEqual({
      from: "2026-09-01",
      to: "2026-09-07",
      tz: "Asia/Ho_Chi_Minh",
      channel: "messenger",
      action: "123456",
    })
  })

  test.each([
    ["channel", "foo"],
    ["channel", "instagram"],
    ["action", "abc"],
    ["action", "12a"],
    ["action", "-1"],
    ["action", ""],
  ])("%s=%s resolves to all", (key, value) => {
    expect(
      googleAdsStatsSearchParamsCache.parse({ [key]: value })[key as "channel"],
    ).toBeNull()
  })
})

describe("Google Ads statistics page", () => {
  test("is guarded for super admins", async () => {
    await render()

    expect(mocks.resolveGuardedWorkspaceId).toHaveBeenCalledWith(
      expect.any(Promise),
      "superAdmin",
    )
  })

  test("asks the service for the default range when the URL has none", async () => {
    await render()

    expect(mocks.getStats).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      from: "",
      to: "",
      tz: "",
      channel: undefined,
      conversionActionId: undefined,
    })
  })

  test("passes valid filters to the service", async () => {
    await render({
      from: "2026-09-01",
      to: "2026-09-07",
      tz: "Asia/Ho_Chi_Minh",
      channel: "whatsapp",
      action: "111",
    })

    expect(mocks.getStats).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      from: "2026-09-01",
      to: "2026-09-07",
      tz: "Asia/Ho_Chi_Minh",
      channel: "whatsapp",
      conversionActionId: "111",
    })
  })

  test("a bad channel or action resets the filter and still renders the stats", async () => {
    await render({ channel: "foo", action: "abc" })

    expect(mocks.getStats).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: undefined,
        conversionActionId: undefined,
      }),
    )
    expect(mocks.view).toHaveBeenCalledWith(
      expect.objectContaining({ stats, channel: null, action: null }),
      undefined,
    )
  })

  test("renders the view with the connection, the workspace birth and the synced actions", async () => {
    await render()

    expect(mocks.view).toHaveBeenCalledWith(
      expect.objectContaining({
        connected: true,
        referenceNow: expect.stringMatching(ISO_INSTANT),
        workspaceCreatedAt: createdAt,
        syncedActions: [{ id: "111", name: "Purchase" }],
        googleReport: { status: "ok", total: 0, byAction: [] },
      }),
      undefined,
    )
  })

  test("asks Google for the days the stats resolved, and only when connected", async () => {
    await render()
    expect(mocks.getConversionReport).toHaveBeenCalledWith("ws-1", {
      from: stats.range.from,
      to: stats.range.to,
    })

    mocks.getConversionReport.mockClear()
    mocks.getSetup.mockResolvedValue(null)
    await render()
    expect(mocks.getConversionReport).not.toHaveBeenCalled()
  })

  test("without a connection the view is told so and has no synced actions", async () => {
    mocks.getSetup.mockResolvedValue(null)

    await render()

    expect(mocks.view).toHaveBeenCalledWith(
      expect.objectContaining({ connected: false, syncedActions: [] }),
      undefined,
    )
  })

  test("lists itself in the nav with the connected Meta channels once connected", async () => {
    await render()

    expect(mocks.nav).toHaveBeenCalledWith(
      { adsChannels: ["whatsapp"], showGoogleAds: true },
      undefined,
    )
  })

  test("does not list itself without a connection and without any conversion", async () => {
    mocks.getSetup.mockResolvedValue(null)

    await render()

    expect(mocks.nav).toHaveBeenCalledWith(
      { adsChannels: ["whatsapp"], showGoogleAds: false },
      undefined,
    )
  })

  test("still lists itself without a connection while conversion history exists", async () => {
    mocks.getSetup.mockResolvedValue(null)
    mocks.hasAnyEvent.mockResolvedValue(true)

    await render()

    expect(mocks.nav).toHaveBeenCalledWith(
      { adsChannels: ["whatsapp"], showGoogleAds: true },
      undefined,
    )
  })

  test("404s when the workspace is gone", async () => {
    mocks.findWorkspace.mockResolvedValue(null)

    await expect(render()).rejects.toThrow("not found")
  })

  test("a failing query surfaces to the error boundary instead of rendering", async () => {
    mocks.getStats.mockRejectedValue(new Error("db down"))

    await expect(render()).rejects.toThrow("db down")
    expect(mocks.view).not.toHaveBeenCalled()
  })
})
