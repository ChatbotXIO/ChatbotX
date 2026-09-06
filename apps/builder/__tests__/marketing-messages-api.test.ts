import { describe, expect, test } from "vitest"
import { toAdAccountOption } from "@/features/facebook-marketing-messages/lib/ad-account-option"
import {
  customAudienceTosUrl,
  isCustomAudienceTosAccepted,
} from "@/features/facebook-marketing-messages/lib/tos"

describe("toAdAccountOption", () => {
  test("flattens the Graph ToS map into a boolean plus a remediation link", () => {
    const option = toAdAccountOption({
      id: "act_123",
      accountId: "123",
      name: "Main",
      currency: "USD",
      tosAccepted: {},
    })

    expect(option).toEqual({
      id: "act_123",
      accountId: "123",
      name: "Main",
      currency: "USD",
      tosAccepted: false,
      tosUrl:
        "https://business.facebook.com/ads/manage/customaudiences/tos/?act=123",
    })
  })

  test("marks an accepted account and still exposes the link", () => {
    const option = toAdAccountOption({
      id: "act_9",
      accountId: "9",
      currency: "JPY",
      tosAccepted: { custom_audience_tos: 1 },
    })

    expect(option.tosAccepted).toBe(true)
    expect(option.name).toBe("act_9")
  })
})

describe("tos helpers stay consistent with the API mapping", () => {
  test("the mapper uses the shared helpers", () => {
    expect(isCustomAudienceTosAccepted({ custom_audience_tos: 1 })).toBe(true)
    expect(customAudienceTosUrl("act_5")).toContain("act=5")
  })
})
