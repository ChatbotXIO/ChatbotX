import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  countCtwaConversationsByAd: vi.fn(),
  countConversionEventsByAd: vi.fn(),
  countCtwaConversationsByDayAndAd: vi.fn(),
  countConversionEventsByDayAndAd: vi.fn(),
  countByCapiStatus: vi.fn(),
  countAllChannelConversationsByAd: vi.fn(),
  countAllChannelConversationsByDayAndAd: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  adsConversionEventRepository: {
    countCtwaConversationsByAd: mocks.countCtwaConversationsByAd,
    countConversionEventsByAd: mocks.countConversionEventsByAd,
    countCtwaConversationsByDayAndAd: mocks.countCtwaConversationsByDayAndAd,
    countConversionEventsByDayAndAd: mocks.countConversionEventsByDayAndAd,
    countByCapiStatus: mocks.countByCapiStatus,
    countAllChannelConversationsByAd: mocks.countAllChannelConversationsByAd,
    countAllChannelConversationsByDayAndAd:
      mocks.countAllChannelConversationsByDayAndAd,
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

  test("omitting timezone leaves it undefined on the repository call (repository defaults to UTC)", async () => {
    await adsConversionService.getCtwaFunnelTimeseries({
      workspaceId: "1",
      since: new Date("2026-08-10T00:00:00.000Z"),
      until: new Date("2026-08-11T23:59:59.999Z"),
    })

    expect(
      mocks.countCtwaConversationsByDayAndAd.mock.calls[0]?.[0].timezone,
    ).toBeUndefined()
    expect(
      mocks.countConversionEventsByDayAndAd.mock.calls[0]?.[0].timezone,
    ).toBeUndefined()
  })

  test("threads an explicit viewer timezone through to both daily repository queries", async () => {
    await adsConversionService.getCtwaFunnelTimeseries({
      workspaceId: "1",
      since: new Date("2026-08-10T00:00:00.000Z"),
      until: new Date("2026-08-11T23:59:59.999Z"),
      timezone: "Asia/Saigon",
    })

    expect(mocks.countCtwaConversationsByDayAndAd).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: "Asia/Saigon" }),
      undefined,
    )
    expect(mocks.countConversionEventsByDayAndAd).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: "Asia/Saigon" }),
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

describe("AdsConversionService.getCtwaFunnel — allChannels ('All channels' default)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("dispatches to the all-channel repository methods instead of the single-channel ones", async () => {
    mocks.countAllChannelConversationsByAd.mockResolvedValue([])
    mocks.countConversionEventsByAd.mockResolvedValue([])

    await adsConversionService.getCtwaFunnel({
      workspaceId: "1",
      allChannels: true,
      since: new Date("2026-08-10T00:00:00.000Z"),
      until: new Date("2026-08-11T23:59:59.999Z"),
    })

    expect(mocks.countAllChannelConversationsByAd).toHaveBeenCalledWith(
      { workspaceId: "1", since: expect.any(Date), until: expect.any(Date) },
      undefined,
    )
    expect(mocks.countCtwaConversationsByAd).not.toHaveBeenCalled()
    // Leads/purchases already share one repo method — `allChannels` threads
    // straight through via `parsed`, same call the single-channel path uses.
    expect(mocks.countConversionEventsByAd).toHaveBeenCalledWith(
      expect.objectContaining({ allChannels: true }),
      undefined,
    )
  })

  test("mixed-channel: an ad with conversions on TWO channels yields ONE funnel row, carrying both channels — the spend-double-count guard", async () => {
    mocks.countAllChannelConversationsByAd.mockResolvedValue([
      { adId: "ad-1", channel: "messenger", conversations: 2 },
      { adId: "ad-1", channel: "instagram", conversations: 3 },
    ])
    mocks.countConversionEventsByAd.mockResolvedValue([
      {
        adId: "ad-1",
        eventType: "lead",
        channel: "messenger",
        count: 1,
        purchaseValue: null,
      },
      {
        adId: "ad-1",
        eventType: "purchase",
        channel: "instagram",
        count: 1,
        purchaseValue: "10.00",
      },
    ])

    const result = await adsConversionService.getCtwaFunnel({
      workspaceId: "1",
      allChannels: true,
      since: new Date("2026-08-10T00:00:00.000Z"),
      until: new Date("2026-08-11T23:59:59.999Z"),
    })

    // ONE row for adId "ad-1" — identity never split by channel (Facebook
    // Insights spend has no channel dimension, so a split identity would
    // double-count spend when merged with insights downstream).
    expect(result.perAd).toHaveLength(1)
    const row = result.perAd[0]
    expect(row.adId).toBe("ad-1")
    expect(row.conversations).toBe(5)
    expect(row.leads).toBe(1)
    expect(row.purchases).toBe(1)
    expect(row.revenue).toBe(10)
    expect(row.channels).toEqual(
      expect.arrayContaining(["messenger", "instagram"]),
    )
    expect(row.channels).toHaveLength(2)
  })

  test("whatsapp-only regression: identical to before — channel='whatsapp' never populates `channels`", async () => {
    mocks.countCtwaConversationsByAd.mockResolvedValue([
      { adId: "ad-1", conversations: 2 },
    ])
    mocks.countConversionEventsByAd.mockResolvedValue([
      { adId: "ad-1", eventType: "lead", count: 1, purchaseValue: null },
    ])

    const result = await adsConversionService.getCtwaFunnel({
      workspaceId: "1",
      channel: "whatsapp",
      since: new Date("2026-08-10T00:00:00.000Z"),
      until: new Date("2026-08-11T23:59:59.999Z"),
    })

    expect(mocks.countAllChannelConversationsByAd).not.toHaveBeenCalled()
    expect(result.perAd).toEqual([
      expect.objectContaining({
        adId: "ad-1",
        conversations: 2,
        leads: 1,
        channels: undefined,
      }),
    ])
  })
})

describe("AdsConversionService.getCtwaFunnelTimeseries — allChannels", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("threads an explicit viewer timezone through to the all-channel day-bucketed repository method", async () => {
    mocks.countAllChannelConversationsByDayAndAd.mockResolvedValue([])
    mocks.countConversionEventsByDayAndAd.mockResolvedValue([])

    await adsConversionService.getCtwaFunnelTimeseries({
      workspaceId: "1",
      allChannels: true,
      since: new Date("2026-08-10T00:00:00.000Z"),
      until: new Date("2026-08-11T23:59:59.999Z"),
      timezone: "Asia/Saigon",
    })

    expect(mocks.countAllChannelConversationsByDayAndAd).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: "Asia/Saigon" }),
      undefined,
    )
    expect(mocks.countConversionEventsByDayAndAd).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: "Asia/Saigon" }),
      undefined,
    )
  })

  test("dispatches to the all-channel day-bucketed repository method and accumulates same-day/same-ad rows across channels", async () => {
    mocks.countAllChannelConversationsByDayAndAd.mockResolvedValue([
      {
        date: "2026-08-10",
        adId: "ad-1",
        channel: "messenger",
        conversations: 2,
      },
      {
        date: "2026-08-10",
        adId: "ad-1",
        channel: "instagram",
        conversations: 3,
      },
    ])
    mocks.countConversionEventsByDayAndAd.mockResolvedValue([])

    const result = await adsConversionService.getCtwaFunnelTimeseries({
      workspaceId: "1",
      allChannels: true,
      since: new Date("2026-08-10T00:00:00.000Z"),
      until: new Date("2026-08-11T23:59:59.999Z"),
    })

    expect(mocks.countAllChannelConversationsByDayAndAd).toHaveBeenCalledWith(
      { workspaceId: "1", since: expect.any(Date), until: expect.any(Date) },
      undefined,
    )
    expect(mocks.countCtwaConversationsByDayAndAd).not.toHaveBeenCalled()
    expect(result).toEqual([
      {
        date: "2026-08-10",
        adId: "ad-1",
        conversations: 5,
        leads: 0,
        purchases: 0,
      },
    ])
  })
})
