// @vitest-environment node
import { createTranslator } from "next-intl"
import { describe, expect, test } from "vitest"
import messages from "../messages/en.json"
import {
  getMetaCapiActionSourceLabel,
  getMetaCapiContentTypeLabel,
  getMetaCapiEventLabel,
  META_CAPI_ACTION_SOURCE_DOCS_URL,
} from "../src/features/meta-conversions/lib/event-label"

const t = createTranslator({ locale: "en", messages })

describe("getMetaCapiEventLabel", () => {
  test("returns the translated label for a business-messaging standard event", () => {
    expect(getMetaCapiEventLabel("LeadSubmitted", t)).toBe("Lead Submitted")
    expect(getMetaCapiEventLabel("Purchase", t)).toBe("Purchase")
    expect(getMetaCapiEventLabel("CartAbandoned", t)).toBe("Cart Abandoned")
  })

  test("returns the translated label for a pixel-only standard event", () => {
    expect(getMetaCapiEventLabel("Lead", t)).toBe("Lead")
    expect(getMetaCapiEventLabel("AddPaymentInfo", t)).toBe("Add Payment Info")
    expect(getMetaCapiEventLabel("Subscribe", t)).toBe("Subscribe")
  })

  test("returns the raw custom name verbatim for an unknown event name", () => {
    expect(getMetaCapiEventLabel("MyCustomEvent", t)).toBe("MyCustomEvent")
  })
})

describe("getMetaCapiActionSourceLabel", () => {
  test("returns the translated label for every action source", () => {
    expect(getMetaCapiActionSourceLabel("business_messaging", t)).toBe(
      "Business Messaging",
    )
    expect(getMetaCapiActionSourceLabel("email", t)).toBe("Email")
    expect(getMetaCapiActionSourceLabel("other", t)).toBe("Other")
  })
})

describe("getMetaCapiContentTypeLabel", () => {
  test("returns the translated label for every content type", () => {
    expect(getMetaCapiContentTypeLabel("product", t)).toBe("Product")
    expect(getMetaCapiContentTypeLabel("product_group", t)).toBe(
      "Product Group",
    )
  })
})

test("META_CAPI_ACTION_SOURCE_DOCS_URL points at Meta's action_source docs", () => {
  expect(META_CAPI_ACTION_SOURCE_DOCS_URL).toBe(
    "https://developers.facebook.com/documentation/ads-commerce/conversions-api/parameters/server-event#action_source",
  )
})
