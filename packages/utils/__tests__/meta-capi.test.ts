import { describe, expect, test } from "vitest"
import {
  defaultEventNameByCatalog,
  metaCapiActionSourcePolicy,
  metaCapiActionSourceValues,
  metaCapiBusinessMessagingEventNames,
  metaCapiContentTypeValues,
  metaCapiCurrencySchema,
  metaCapiEventNameSchema,
  metaCapiValueSchema,
  metaPixelStandardEventNames,
} from "../src/meta-capi"

describe("metaCapiActionSourcePolicy", () => {
  test("has exactly one entry per offered action source", () => {
    expect(Object.keys(metaCapiActionSourcePolicy).sort()).toEqual(
      [...metaCapiActionSourceValues].sort(),
    )
  })

  test("only business_messaging uses the messaging identity and business-messaging catalog", () => {
    for (const actionSource of metaCapiActionSourceValues) {
      const policy = metaCapiActionSourcePolicy[actionSource]
      const isBusinessMessaging = actionSource === "business_messaging"

      expect(policy.usesMessagingIdentity).toBe(isBusinessMessaging)
      expect(policy.eventCatalog).toBe(
        isBusinessMessaging ? "businessMessaging" : "pixel",
      )
      expect(policy.allowsCustomEventNames).toBe(!isBusinessMessaging)
    }
  })
})

describe("event name catalogs", () => {
  test("business-messaging catalog has Meta's 14 documented events", () => {
    expect(metaCapiBusinessMessagingEventNames).toHaveLength(14)
    expect(metaCapiBusinessMessagingEventNames).toContain("LeadSubmitted")
  })

  test("pixel catalog has Meta's 17 standard events", () => {
    expect(metaPixelStandardEventNames).toHaveLength(17)
    expect(metaPixelStandardEventNames).toContain("Lead")
  })

  test("defaults each catalog to its documented default event", () => {
    expect(defaultEventNameByCatalog.businessMessaging).toBe("LeadSubmitted")
    expect(defaultEventNameByCatalog.pixel).toBe("Lead")
  })
})

describe("metaCapiEventNameSchema", () => {
  test("accepts a standard or custom event name up to 50 characters", () => {
    expect(metaCapiEventNameSchema.safeParse("Purchase").success).toBe(true)
    expect(metaCapiEventNameSchema.safeParse("my-custom-event").success).toBe(
      true,
    )
    expect(metaCapiEventNameSchema.safeParse("a".repeat(50)).success).toBe(true)
  })

  test("rejects an empty, whitespace-only, or over-length event name", () => {
    expect(metaCapiEventNameSchema.safeParse("").success).toBe(false)
    expect(metaCapiEventNameSchema.safeParse("   ").success).toBe(false)
    expect(metaCapiEventNameSchema.safeParse("a".repeat(51)).success).toBe(
      false,
    )
  })
})

describe("metaCapiContentTypeValues", () => {
  test("only offers Meta's two documented content types", () => {
    expect(metaCapiContentTypeValues).toEqual(["product", "product_group"])
  })
})

describe("metaCapiValueSchema / metaCapiCurrencySchema", () => {
  test.each([
    "19.99",
    " 250 ",
    "0",
    "9007199254740991",
  ])("accepts plain decimal %j", (input) => {
    expect(metaCapiValueSchema.safeParse(input).success).toBe(true)
  })

  test.each([
    "12,50",
    "1e5",
    "-5",
    "abc",
    "{{amount}}",
    "",
    "1.",
    ".5",
  ])("rejects non-canonical value %j", (input) => {
    expect(metaCapiValueSchema.safeParse(input).success).toBe(false)
  })

  test("rejects a value that would not survive Number() intact", () => {
    expect(metaCapiValueSchema.safeParse("9007199254740992").success).toBe(
      false,
    )
    expect(metaCapiValueSchema.safeParse("1".repeat(400)).success).toBe(false)
  })

  test("currency is upper-cased and must be a 3-letter code", () => {
    expect(metaCapiCurrencySchema.parse(" usd ")).toBe("USD")
    expect(metaCapiCurrencySchema.safeParse("US").success).toBe(false)
    expect(metaCapiCurrencySchema.safeParse("USDT").success).toBe(false)
  })
})
