import { describe, expect, test } from "vitest"
import {
  customAudienceTosUrl,
  isCustomAudienceTosAccepted,
} from "@/features/facebook-marketing-messages/lib/tos"

describe("isCustomAudienceTosAccepted", () => {
  test("accepts when the custom audience term is flagged", () => {
    expect(isCustomAudienceTosAccepted({ custom_audience_tos: 1 })).toBe(true)
  })

  test("accepts the web_custom_audience_tos spelling", () => {
    expect(isCustomAudienceTosAccepted({ web_custom_audience_tos: 1 })).toBe(
      true,
    )
  })

  test("treats a missing map as not accepted", () => {
    expect(isCustomAudienceTosAccepted(undefined)).toBe(false)
    expect(isCustomAudienceTosAccepted({})).toBe(false)
  })

  test("treats a zero flag as not accepted", () => {
    expect(isCustomAudienceTosAccepted({ custom_audience_tos: 0 })).toBe(false)
  })

  test("ignores unrelated accepted terms", () => {
    expect(isCustomAudienceTosAccepted({ some_other_tos: 1 })).toBe(false)
  })
})

describe("customAudienceTosUrl", () => {
  test("uses the bare account id, without the act_ prefix", () => {
    expect(customAudienceTosUrl("123456")).toBe(
      "https://business.facebook.com/ads/manage/customaudiences/tos/?act=123456",
    )
  })

  test("strips an act_ prefix if one is passed by mistake", () => {
    expect(customAudienceTosUrl("act_123456")).toBe(
      "https://business.facebook.com/ads/manage/customaudiences/tos/?act=123456",
    )
  })
})
