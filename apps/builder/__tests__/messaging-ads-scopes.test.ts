import { describe, expect, test } from "vitest"
import { messagingAdsScopesForChannel } from "@/features/ads-campaign/lib/messaging-ads-scopes"

describe("messagingAdsScopesForChannel", () => {
  test("whatsapp (CTWA) requests whatsapp_business_management", () => {
    expect(messagingAdsScopesForChannel("whatsapp")).toContain(
      "whatsapp_business_management",
    )
  })

  test("messenger (CTM) does NOT request any WhatsApp scope", () => {
    expect(messagingAdsScopesForChannel("messenger")).not.toContain(
      "whatsapp_business_management",
    )
  })

  test("instagram (CTID) adds instagram_basic but no WhatsApp scope", () => {
    const scopes = messagingAdsScopesForChannel("instagram")
    expect(scopes).toContain("instagram_basic")
    expect(scopes).not.toContain("whatsapp_business_management")
  })

  test("every channel keeps the confirmed base ads/page scopes", () => {
    for (const channel of ["whatsapp", "messenger", "instagram"] as const) {
      const scopes = messagingAdsScopesForChannel(channel)
      for (const base of [
        "ads_read",
        "ads_management",
        "pages_manage_ads",
        "pages_read_engagement",
        "pages_show_list",
      ]) {
        expect(scopes).toContain(base)
      }
    }
  })
})
