import { describe, expect, test } from "vitest"
import {
  errorLabelKey,
  messageLabelKey,
} from "@/features/facebook-marketing-messages/lib/error-labels"

describe("errorLabelKey", () => {
  test("maps the opt-out code", () => {
    expect(errorLabelKey(2_300_034)).toBe(
      "facebookMarketingMessages.delivery.errors.optedOut",
    )
  })

  test("groups budget codes onto one label", () => {
    expect(errorLabelKey(2_300_053)).toBe(errorLabelKey(2_300_015))
  })

  test("returns null for null and unknown codes", () => {
    expect(errorLabelKey(null)).toBeNull()
    expect(errorLabelKey(1)).toBeNull()
  })
})

describe("messageLabelKey", () => {
  test("labels the two known webhook strings", () => {
    expect(messageLabelKey("deliveryFailed")).toBe(
      "facebookMarketingMessages.delivery.errors.deliveryFailed",
    )
    expect(messageLabelKey("outcomeUnknown")).toBe(
      "facebookMarketingMessages.delivery.errors.outcomeUnknown",
    )
    expect(messageLabelKey("something Meta said")).toBeNull()
  })
})
