import { describe, expect, test } from "vitest"
import {
  defaultEventNameByCatalog,
  metaCapiActionSourcePolicy,
  metaCapiActionSourceValues,
  metaCapiBusinessMessagingEventNames,
  metaCapiContentTypeValues,
  metaCapiEventNameSchema,
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
