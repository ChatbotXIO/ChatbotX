import { describe, expect, test } from "vitest"
import {
  classifyMarketingMessageError,
  type MarketingMessageErrorClass,
} from "../src/marketing-messages/error-classes"

const CASES: [number | null, MarketingMessageErrorClass][] = [
  [2_300_054, "dailyBudget"],
  [2_300_053, "lifetimeBudget"],
  [2_300_015, "lifetimeBudget"],
  [2_300_012, "notReady"],
  [2_300_078, "transient"],
  [2_300_008, "transient"],
  // Marketing Messages rate limit: retry, never a permanent recipient failure.
  [2_300_080, "transient"],
  [2_300_035, "recipientTiming"],
  [2_300_004, "recipientPermanent"],
  [2_300_000, "campaignInactive"],
  [2_300_001, "campaignBlocker"],
  [2_300_093, "campaignBlocker"],
  [190, "campaignBlocker"],
  [2_300_010, "contentInvalid"],
  [2_300_024, "contentInvalid"],
  [2_300_073, "contentInvalid"],
  [2_300_090, "contentInvalid"],
  // Generic Graph throttling: retry, never a permanent recipient failure.
  [4, "transient"],
  [17, "transient"],
  [32, "transient"],
  [613, "transient"],
  // Generic Graph permission / policy errors block the whole campaign.
  [10, "campaignBlocker"],
  [200, "campaignBlocker"],
  [250, "campaignBlocker"],
  [299, "campaignBlocker"],
  [368, "campaignBlocker"],
  [null, "unknown"],
  [999, "unknown"],
  [300, "unknown"],
]

describe("classifyMarketingMessageError", () => {
  test.each(CASES)("%s -> %s", (code, expected) => {
    expect(classifyMarketingMessageError(code)).toBe(expected)
  })

  test("HTTP 429 without a Graph code is transient", () => {
    expect(classifyMarketingMessageError(null, 429)).toBe("transient")
    expect(classifyMarketingMessageError(null, 400)).toBe("unknown")
    // a Graph code wins over the HTTP status
    expect(classifyMarketingMessageError(2_300_004, 429)).toBe(
      "recipientPermanent",
    )
  })
})
