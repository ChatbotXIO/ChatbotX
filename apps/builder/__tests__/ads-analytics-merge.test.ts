import { describe, expect, test } from "vitest"
import { mergeAdsAnalytics } from "@/features/ads/lib/merge-analytics"

describe("mergeAdsAnalytics", () => {
  test("merges matched, insight-only, event-only, and unattributed rows", () => {
    const result = mergeAdsAnalytics({
      funnel: {
        totals: { conversations: 8, leads: 4, purchases: 2, revenue: 42.5 },
        perAd: [
          {
            adId: "ad-1",
            conversations: 5,
            leads: 2,
            purchases: 1,
            revenue: 30,
          },
          {
            adId: "ad-events-only",
            conversations: 2,
            leads: 1,
            purchases: 1,
            revenue: 12.5,
          },
          {
            adId: null,
            conversations: 1,
            leads: 1,
            purchases: 0,
            revenue: 0,
          },
        ],
      },
      insights: [
        { adId: "ad-1", adName: "Matched", spend: "10.00" },
        { adId: "ad-insights-only", adName: "Spend only", spend: "7.50" },
      ],
    })

    expect(result.totals).toEqual({
      conversations: 8,
      leads: 4,
      purchases: 2,
      revenue: 42.5,
      spend: 17.5,
      costPerLead: 4.375,
      costPerPurchase: 8.75,
      roas: 42.5 / 17.5,
      impressions: 0,
      clicks: 0,
      cpc: null,
      ctr: null,
      cpm: null,
      costPerConversation: 17.5 / 8,
    })
    expect(result.perAd).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          adId: "ad-1",
          adName: "Matched",
          spend: 10,
          costPerLead: 5,
          costPerPurchase: 10,
          revenue: 30,
          roas: 3,
        }),
        expect.objectContaining({
          adId: "ad-insights-only",
          conversations: 0,
          leads: 0,
          purchases: 0,
          revenue: 0,
          spend: 7.5,
          costPerLead: null,
          costPerPurchase: null,
          roas: 0,
        }),
        expect.objectContaining({
          adId: "ad-events-only",
          revenue: 12.5,
          spend: null,
          costPerLead: null,
          costPerPurchase: null,
          roas: null,
        }),
        expect.objectContaining({
          adId: null,
          conversations: 1,
          revenue: 0,
          spend: null,
        }),
      ]),
    )
  })

  test("guards division by zero and ignores invalid spend strings", () => {
    const result = mergeAdsAnalytics({
      funnel: {
        totals: { conversations: 0, leads: 0, purchases: 0, revenue: 5 },
        perAd: [],
      },
      insights: [{ adId: "ad-1", spend: "not-a-number" }],
    })

    expect(result.totals.costPerLead).toBeNull()
    expect(result.totals.costPerPurchase).toBeNull()
    expect(result.totals.roas).toBeNull()
    expect(result.perAd[0]).toMatchObject({
      adId: "ad-1",
      spend: 0,
      costPerLead: null,
      costPerPurchase: null,
      roas: null,
    })
  })

  test("drops spend-only rows and sums shown spend when an integration filter is active", () => {
    const result = mergeAdsAnalytics({
      integrationFilterActive: true,
      funnel: {
        totals: { conversations: 3, leads: 1, purchases: 0, revenue: 25 },
        perAd: [
          {
            adId: "ad-1",
            conversations: 3,
            leads: 1,
            purchases: 0,
            revenue: 25,
          },
        ],
      },
      insights: [
        { adId: "ad-1", adName: "Matched", spend: "10.00" },
        { adId: "ad-spend-only", adName: "Spend only", spend: "90.00" },
      ],
    })

    expect(result.totals.spend).toBe(10)
    expect(result.totals.revenue).toBe(25)
    expect(result.totals.costPerLead).toBe(10)
    expect(result.totals.roas).toBe(2.5)
    expect(result.perAd).toHaveLength(1)
    expect(result.perAd[0]).toMatchObject({
      adId: "ad-1",
      adName: "Matched",
      revenue: 25,
      spend: 10,
      roas: 2.5,
    })
  })

  test("drops spend-null rows and recomputes totals when an ad account filter is active", () => {
    const result = mergeAdsAnalytics({
      adAccountFilterActive: true,
      funnel: {
        totals: { conversations: 10, leads: 5, purchases: 3, revenue: 140 },
        perAd: [
          {
            adId: "ad-1",
            conversations: 6,
            leads: 3,
            purchases: 2,
            revenue: 100,
          },
          {
            adId: "ad-funnel-only",
            conversations: 3,
            leads: 1,
            purchases: 1,
            revenue: 40,
          },
          {
            adId: null,
            conversations: 1,
            leads: 1,
            purchases: 0,
            revenue: 0,
          },
        ],
      },
      insights: [{ adId: "ad-1", adName: "Matched", spend: "25.00" }],
    })

    expect(result.totals).toEqual({
      conversations: 6,
      leads: 3,
      purchases: 2,
      revenue: 100,
      spend: 25,
      costPerLead: 25 / 3,
      costPerPurchase: 12.5,
      roas: 4,
      impressions: 0,
      clicks: 0,
      cpc: null,
      ctr: null,
      cpm: null,
      costPerConversation: 25 / 6,
    })
    expect(result.perAd).toEqual([
      expect.objectContaining({
        adId: "ad-1",
        adName: "Matched",
        spend: 25,
        revenue: 100,
        roas: 4,
      }),
    ])
  })

  test("keeps spend-null rows when the ad account filter is inactive", () => {
    const result = mergeAdsAnalytics({
      adAccountFilterActive: false,
      funnel: {
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
      },
      insights: [],
    })

    expect(result.totals).toEqual({
      conversations: 2,
      leads: 1,
      purchases: 0,
      revenue: 0,
      spend: 0,
      costPerLead: 0,
      costPerPurchase: null,
      roas: null,
      impressions: 0,
      clicks: 0,
      cpc: null,
      ctr: null,
      cpm: null,
      costPerConversation: 0,
    })
    expect(result.perAd).toEqual([
      expect.objectContaining({ adId: "ad-funnel-only", spend: null }),
    ])
  })

  test("composes ad account and integration filters", () => {
    const result = mergeAdsAnalytics({
      adAccountFilterActive: true,
      integrationFilterActive: true,
      funnel: {
        totals: { conversations: 3, leads: 1, purchases: 1, revenue: 25 },
        perAd: [
          {
            adId: "ad-1",
            conversations: 3,
            leads: 1,
            purchases: 1,
            revenue: 25,
          },
          {
            adId: "ad-other-account",
            conversations: 1,
            leads: 1,
            purchases: 0,
            revenue: 0,
          },
        ],
      },
      insights: [
        { adId: "ad-1", adName: "Matched", spend: "10.00" },
        { adId: "ad-spend-only", adName: "Spend only", spend: "90.00" },
      ],
    })

    expect(result.totals.spend).toBe(10)
    expect(result.totals.conversations).toBe(3)
    expect(result.totals.revenue).toBe(25)
    expect(result.perAd).toEqual([
      expect.objectContaining({ adId: "ad-1", spend: 10 }),
    ])
  })

  test("sums impressions/clicks across multiple insight rows for the same ad and derives cpc/ctr/cpm", () => {
    const result = mergeAdsAnalytics({
      funnel: {
        totals: { conversations: 5, leads: 2, purchases: 1, revenue: 20 },
        perAd: [
          {
            adId: "ad-1",
            conversations: 5,
            leads: 2,
            purchases: 1,
            revenue: 20,
          },
        ],
      },
      insights: [
        // Two ad accounts reporting the same ad — impressions/clicks/spend
        // must accumulate like spend already does.
        { adId: "ad-1", spend: "10.00", impressions: 1000, clicks: "40" },
        { adId: "ad-1", spend: "10.00", impressions: 1000, clicks: "10" },
      ],
    })

    const row = result.perAd.find((r) => r.adId === "ad-1")
    expect(row).toMatchObject({
      spend: 20,
      impressions: 2000,
      clicks: 50,
      cpc: 0.4,
      ctr: 0.025,
      cpm: 10,
      costPerConversation: 4,
    })
    expect(result.totals).toMatchObject({
      spend: 20,
      impressions: 2000,
      clicks: 50,
      cpc: 0.4,
      ctr: 0.025,
      cpm: 10,
      costPerConversation: 4,
    })
  })

  test("keeps impressions/clicks/cpc/ctr/cpm/costPerConversation null for funnel-only rows", () => {
    const result = mergeAdsAnalytics({
      funnel: {
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
      },
      insights: [],
    })

    expect(result.perAd[0]).toMatchObject({
      spend: null,
      impressions: null,
      clicks: null,
      cpc: null,
      ctr: null,
      cpm: null,
      costPerConversation: null,
    })
  })

  test("returns null cpc/ctr/cpm/costPerConversation when the denominator is zero", () => {
    const result = mergeAdsAnalytics({
      funnel: {
        totals: { conversations: 0, leads: 0, purchases: 0, revenue: 0 },
        perAd: [],
      },
      insights: [{ adId: "ad-1", spend: "10.00", impressions: 0, clicks: 0 }],
    })

    expect(result.perAd[0]).toMatchObject({
      spend: 10,
      impressions: 0,
      clicks: 0,
      cpc: null,
      ctr: null,
      cpm: null,
      costPerConversation: null,
    })
    expect(result.totals).toMatchObject({
      cpc: null,
      ctr: null,
      cpm: null,
      costPerConversation: null,
    })
  })

  test("computes totals from survivor perAd rows only when the ad account filter is active", () => {
    const result = mergeAdsAnalytics({
      adAccountFilterActive: true,
      funnel: {
        totals: { conversations: 10, leads: 5, purchases: 3, revenue: 140 },
        perAd: [
          {
            adId: "ad-1",
            conversations: 6,
            leads: 3,
            purchases: 2,
            revenue: 100,
          },
          {
            adId: "ad-funnel-only",
            conversations: 4,
            leads: 2,
            purchases: 1,
            revenue: 40,
          },
        ],
      },
      insights: [
        { adId: "ad-1", spend: "25.00", impressions: 500, clicks: 25 },
      ],
    })

    // ad-funnel-only has no matching insight row so it's dropped by the
    // ad-account filter — impressions/clicks totals must reflect only ad-1.
    expect(result.totals).toMatchObject({
      conversations: 6,
      impressions: 500,
      clicks: 25,
      cpc: 1,
      ctr: 0.05,
      cpm: 50,
      costPerConversation: 25 / 6,
    })
  })

  // Phase 6: CTM (Messenger) / CTID (Instagram) ads live in the SAME Facebook
  // ad account and insights API as WhatsApp CTWA ads — mergeAdsAnalytics
  // merges funnel rows to insight rows purely by `adId`, with no notion of
  // channel at all. This proves a funnel containing ads attributed to
  // different channels (e.g. one WhatsApp-channel funnel call and one
  // messenger-channel funnel call, combined by the caller) still merges
  // correctly against a single unfiltered insights list — i.e. the function
  // genuinely needs no changes to support multi-channel ads.
  test("merges funnel rows spanning multiple channels against a single insights list by adId alone", () => {
    const result = mergeAdsAnalytics({
      funnel: {
        totals: { conversations: 9, leads: 4, purchases: 2, revenue: 60 },
        perAd: [
          {
            // WhatsApp (CTWA) ad
            adId: "ad-whatsapp-1",
            conversations: 4,
            leads: 2,
            purchases: 1,
            revenue: 30,
          },
          {
            // Messenger (CTM) ad
            adId: "ad-messenger-1",
            conversations: 3,
            leads: 1,
            purchases: 1,
            revenue: 30,
          },
          {
            // Instagram (CTID) ad
            adId: "ad-instagram-1",
            conversations: 2,
            leads: 1,
            purchases: 0,
            revenue: 0,
          },
        ],
      },
      insights: [
        // One unfiltered insights list for the whole ad account — spend for
        // ads of every destination/channel comes back together, same as
        // today's WhatsApp-only flow.
        { adId: "ad-whatsapp-1", adName: "WA Ad", spend: "10.00" },
        { adId: "ad-messenger-1", adName: "Messenger Ad", spend: "15.00" },
        { adId: "ad-instagram-1", adName: "Instagram Ad", spend: "5.00" },
      ],
    })

    expect(result.totals).toEqual({
      conversations: 9,
      leads: 4,
      purchases: 2,
      revenue: 60,
      spend: 30,
      costPerLead: 7.5,
      costPerPurchase: 15,
      roas: 2,
      impressions: 0,
      clicks: 0,
      cpc: null,
      ctr: null,
      cpm: null,
      costPerConversation: 30 / 9,
    })
    expect(result.perAd).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          adId: "ad-whatsapp-1",
          adName: "WA Ad",
          spend: 10,
          revenue: 30,
        }),
        expect.objectContaining({
          adId: "ad-messenger-1",
          adName: "Messenger Ad",
          spend: 15,
          revenue: 30,
        }),
        expect.objectContaining({
          adId: "ad-instagram-1",
          adName: "Instagram Ad",
          spend: 5,
          revenue: 0,
        }),
      ]),
    )
  })
})

describe("mergeAdsAnalytics — 'All channels' channels passenger label", () => {
  test("carries the funnel row's channels straight through, unkeyed by identity", () => {
    const result = mergeAdsAnalytics({
      funnel: {
        totals: { conversations: 5, leads: 1, purchases: 1, revenue: 10 },
        perAd: [
          {
            adId: "ad-mixed",
            conversations: 5,
            leads: 1,
            purchases: 1,
            revenue: 10,
            channels: ["messenger", "instagram"],
          },
        ],
      },
      insights: [{ adId: "ad-mixed", adName: "Mixed Ad", spend: "20.00" }],
    })

    // adId-unique assumption: ONE merged row for "ad-mixed", spend attached
    // exactly once (Facebook Insights has no channel dimension — a split
    // identity would double-count it), channels carried as a passenger
    // label rather than folded into identity.
    expect(result.perAd).toHaveLength(1)
    expect(result.perAd[0]).toEqual(
      expect.objectContaining({
        adId: "ad-mixed",
        spend: 20,
        channels: ["messenger", "instagram"],
      }),
    )
  })

  test("omits channels for a single-channel funnel row (channels undefined, byte-identical to before)", () => {
    const result = mergeAdsAnalytics({
      funnel: {
        totals: { conversations: 2, leads: 0, purchases: 0, revenue: 0 },
        perAd: [
          {
            adId: "ad-1",
            conversations: 2,
            leads: 0,
            purchases: 0,
            revenue: 0,
          },
        ],
      },
      insights: [],
    })

    expect(result.perAd[0]?.channels).toBeUndefined()
  })
})

describe("mergeAdsAnalytics — spendCurrency", () => {
  const emptyFunnel = {
    totals: { conversations: 0, leads: 0, purchases: 0, revenue: 0 },
    perAd: [],
  }

  test("exposes the single shared ad-account currency", () => {
    const result = mergeAdsAnalytics({
      funnel: emptyFunnel,
      insights: [
        { adId: "ad-1", currency: "VND", spend: 100 },
        { adId: "ad-2", currency: "VND", spend: 50 },
      ],
    })

    expect(result.spendCurrency).toBe("VND")
  })

  test("returns null for mixed-currency ad accounts (never stamp a wrong symbol)", () => {
    const result = mergeAdsAnalytics({
      funnel: emptyFunnel,
      insights: [
        { adId: "ad-1", currency: "USD", spend: 100 },
        { adId: "ad-2", currency: "VND", spend: 50 },
      ],
    })

    expect(result.spendCurrency).toBeNull()
  })

  test("returns null when one row's currency is unknown even if others agree", () => {
    const result = mergeAdsAnalytics({
      funnel: emptyFunnel,
      insights: [
        { adId: "ad-1", currency: "USD", spend: 100 },
        { adId: "ad-2", spend: 50 },
      ],
    })

    expect(result.spendCurrency).toBeNull()
  })

  test("returns null when no insights carry a currency", () => {
    const result = mergeAdsAnalytics({
      funnel: emptyFunnel,
      insights: [{ adId: "ad-1", spend: 100 }],
    })

    expect(result.spendCurrency).toBeNull()
  })
})
