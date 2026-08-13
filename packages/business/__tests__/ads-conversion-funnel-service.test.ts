import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  countCtwaConversationsByAd: vi.fn(),
  countConversionEventsByAd: vi.fn(),
  countCtwaConversationsByDayAndAd: vi.fn(),
  countConversionEventsByDayAndAd: vi.fn(),
  countByCapiStatus: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  adsConversionEventRepository: {
    countCtwaConversationsByAd: mocks.countCtwaConversationsByAd,
    countConversionEventsByAd: mocks.countConversionEventsByAd,
    countCtwaConversationsByDayAndAd: mocks.countCtwaConversationsByDayAndAd,
    countConversionEventsByDayAndAd: mocks.countConversionEventsByDayAndAd,
    countByCapiStatus: mocks.countByCapiStatus,
  },
  adsConversionRuleRepository: {},
  integrationFacebookAdsRepository: {},
  integrationWhatsappRepository: {},
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { sendConversionEvent: "sendConversionEvent" },
  enqueueIntegrationJob: vi.fn(),
}))

const { adsConversionService } = await import("../src/ads-conversion/service")

describe("AdsConversionService.getCtwaFunnel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.countCtwaConversationsByAd.mockResolvedValue([
      { adId: "ad-1", conversations: 2 },
    ])
    mocks.countConversionEventsByAd.mockResolvedValue([
      { adId: "ad-1", eventType: "lead", count: 1, purchaseValue: null },
    ])
  })

  test("passes the WhatsApp integration filter to both funnel repository queries", async () => {
    const input = {
      workspaceId: "1",
      integrationWhatsappId: "9",
      since: new Date("2026-08-10T00:00:00.000Z"),
      until: new Date("2026-08-11T23:59:59.999Z"),
    }

    await adsConversionService.getCtwaFunnel(input)

    expect(mocks.countCtwaConversationsByAd).toHaveBeenCalledWith(
      expect.objectContaining({ integrationWhatsappId: "9" }),
      undefined,
    )
    expect(mocks.countConversionEventsByAd).toHaveBeenCalledWith(
      expect.objectContaining({ integrationWhatsappId: "9" }),
      undefined,
    )
  })

  test("surfaces purchase revenue per ad and in totals", async () => {
    mocks.countConversionEventsByAd.mockResolvedValue([
      { adId: "ad-1", eventType: "lead", count: 1, purchaseValue: null },
      {
        adId: "ad-1",
        eventType: "purchase",
        count: 2,
        purchaseValue: "42.50",
      },
    ])

    const result = await adsConversionService.getCtwaFunnel({
      workspaceId: "1",
      since: new Date("2026-08-10T00:00:00.000Z"),
      until: new Date("2026-08-11T23:59:59.999Z"),
    })

    expect(result.totals.revenue).toBe(42.5)
    expect(result.perAd).toContainEqual(
      expect.objectContaining({
        adId: "ad-1",
        purchases: 2,
        revenue: 42.5,
      }),
    )
  })

  test("treats null and non-finite purchase values as zero revenue", async () => {
    mocks.countCtwaConversationsByAd.mockResolvedValue([])
    mocks.countConversionEventsByAd.mockResolvedValue([
      {
        adId: "ad-null",
        eventType: "purchase",
        count: 1,
        purchaseValue: null,
      },
      {
        adId: "ad-invalid",
        eventType: "purchase",
        count: 1,
        purchaseValue: "Infinity",
      },
    ])

    const result = await adsConversionService.getCtwaFunnel({
      workspaceId: "1",
      since: new Date("2026-08-10T00:00:00.000Z"),
      until: new Date("2026-08-11T23:59:59.999Z"),
    })

    expect(result.totals.revenue).toBe(0)
    expect(result.perAd).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ adId: "ad-null", revenue: 0 }),
        expect.objectContaining({ adId: "ad-invalid", revenue: 0 }),
      ]),
    )
  })
})

describe("AdsConversionService.getCtwaFunnelTimeseries", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.countCtwaConversationsByDayAndAd.mockResolvedValue([
      { date: "2026-08-10", adId: "ad-1", conversations: 3 },
      { date: "2026-08-11", adId: "ad-1", conversations: 2 },
    ])
    mocks.countConversionEventsByDayAndAd.mockResolvedValue([
      {
        date: "2026-08-10",
        adId: "ad-1",
        eventType: "lead",
        count: 1,
      },
      {
        date: "2026-08-11",
        adId: "ad-1",
        eventType: "purchase",
        count: 1,
      },
    ])
  })

  test("merges conversation and event counts by (date, adId), keeping adId on every row", async () => {
    const result = await adsConversionService.getCtwaFunnelTimeseries({
      workspaceId: "1",
      since: new Date("2026-08-10T00:00:00.000Z"),
      until: new Date("2026-08-11T23:59:59.999Z"),
    })

    expect(result).toEqual(
      expect.arrayContaining([
        {
          date: "2026-08-10",
          adId: "ad-1",
          conversations: 3,
          leads: 1,
          purchases: 0,
        },
        {
          date: "2026-08-11",
          adId: "ad-1",
          conversations: 2,
          leads: 0,
          purchases: 1,
        },
      ]),
    )
    expect(result).toHaveLength(2)
  })

  test("passes the WhatsApp integration filter to both daily repository queries", async () => {
    const input = {
      workspaceId: "1",
      integrationWhatsappId: "9",
      since: new Date("2026-08-10T00:00:00.000Z"),
      until: new Date("2026-08-11T23:59:59.999Z"),
    }

    await adsConversionService.getCtwaFunnelTimeseries(input)

    expect(mocks.countCtwaConversationsByDayAndAd).toHaveBeenCalledWith(
      expect.objectContaining({ integrationWhatsappId: "9" }),
      undefined,
    )
    expect(mocks.countConversionEventsByDayAndAd).toHaveBeenCalledWith(
      expect.objectContaining({ integrationWhatsappId: "9" }),
      undefined,
    )
  })

  test("keeps rows for different ads on the same day distinct", async () => {
    mocks.countCtwaConversationsByDayAndAd.mockResolvedValue([
      { date: "2026-08-10", adId: "ad-1", conversations: 3 },
      { date: "2026-08-10", adId: "ad-2", conversations: 5 },
    ])
    mocks.countConversionEventsByDayAndAd.mockResolvedValue([])

    const result = await adsConversionService.getCtwaFunnelTimeseries({
      workspaceId: "1",
      since: new Date("2026-08-10T00:00:00.000Z"),
      until: new Date("2026-08-11T23:59:59.999Z"),
    })

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          date: "2026-08-10",
          adId: "ad-1",
          conversations: 3,
        }),
        expect.objectContaining({
          date: "2026-08-10",
          adId: "ad-2",
          conversations: 5,
        }),
      ]),
    )
  })
})

describe("AdsConversionService.getCapiDeliverySummary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.countByCapiStatus.mockResolvedValue([
      { capiStatus: "sent", count: 4 },
      { capiStatus: "skipped_no_scope", count: 2 },
      { capiStatus: "skipped_region", count: 1 },
    ])
  })

  test("normalizes missing CAPI statuses to zero", async () => {
    const result = await adsConversionService.getCapiDeliverySummary({
      workspaceId: "1",
      integrationWhatsappId: "9",
      since: new Date("2026-08-10T00:00:00.000Z"),
      until: new Date("2026-08-11T23:59:59.999Z"),
    })

    expect(mocks.countByCapiStatus).toHaveBeenCalledWith(
      expect.objectContaining({ integrationWhatsappId: "9" }),
      undefined,
    )
    expect(result).toEqual({
      sent: 4,
      pending: 0,
      failed: 0,
      skippedNoScope: 2,
      skippedRegion: 1,
    })
  })
})
