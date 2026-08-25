import { describe, expect, test } from "vitest"
import {
  adsAnalyticsChannelValues,
  adsAnalyticsSearchParamsCache,
} from "@/features/ads/schemas/analytics"

describe("Ads Analytics channel filter — 'All channels' default", () => {
  test("adsAnalyticsChannelValues includes every ads-eligible channel plus the 'all' sentinel", () => {
    expect(adsAnalyticsChannelValues).toEqual(
      expect.arrayContaining(["whatsapp", "messenger", "instagram", "all"]),
    )
    expect(adsAnalyticsChannelValues).toHaveLength(4)
  })

  test("channel defaults to 'all' when the URL param is omitted", async () => {
    const parsed = await adsAnalyticsSearchParamsCache.parse({})

    expect(parsed.channel).toBe("all")
  })

  test("a legacy ?channel=whatsapp deep link still pins WhatsApp (not overridden by the new default)", async () => {
    const parsed = await adsAnalyticsSearchParamsCache.parse({
      channel: "whatsapp",
    })

    expect(parsed.channel).toBe("whatsapp")
  })

  test("a legacy ?channel=messenger deep link still pins Messenger", async () => {
    const parsed = await adsAnalyticsSearchParamsCache.parse({
      channel: "messenger",
    })

    expect(parsed.channel).toBe("messenger")
  })

  test("an explicit ?channel=all round-trips to 'all'", async () => {
    const parsed = await adsAnalyticsSearchParamsCache.parse({
      channel: "all",
    })

    expect(parsed.channel).toBe("all")
  })
})
