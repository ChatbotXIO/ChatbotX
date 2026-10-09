import { describe, expect, test } from "vitest"
import {
  googleEnumLabel,
  googleEnumLabelKeys,
} from "@/features/integration-google-ads/lib/google-enum-labels"
import en from "../messages/en.json"

const t = ((key: string, values?: Record<string, unknown>) =>
  values
    ? `${key}:${Object.values(values).join(",")}`
    : key) as unknown as Parameters<typeof googleEnumLabel>[2]

const resolveKey = (key: string): unknown =>
  key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      en,
    )

describe("googleEnumLabel", () => {
  test("every mapped key resolves to a non-empty English message", () => {
    for (const map of Object.values(googleEnumLabelKeys)) {
      for (const key of Object.values(map)) {
        expect(typeof resolveKey(key)).toBe("string")
      }
    }
    expect(typeof resolveKey("googleAds.enums.unknown")).toBe("string")
  })

  test("covers the upload-clicks categories incl. every lead-like category", () => {
    for (const category of [
      "DEFAULT",
      "PURCHASE",
      "ADD_TO_CART",
      "BEGIN_CHECKOUT",
      "SUBSCRIBE_PAID",
      "PHONE_CALL_LEAD",
      "IMPORTED_LEAD",
      "SUBMIT_LEAD_FORM",
      "BOOK_APPOINTMENT",
      "SIGNUP",
      "REQUEST_QUOTE",
      "GET_DIRECTIONS",
      "OUTBOUND_CLICK",
      "CONTACT",
      "ENGAGEMENT",
      "STORE_VISIT",
      "STORE_SALE",
      "QUALIFIED_LEAD",
      "CONVERTED_LEAD",
      "PAGE_VIEW",
      "DOWNLOAD",
    ]) {
      expect(googleEnumLabelKeys.category).toHaveProperty(category)
    }
  })

  test("translates known values", () => {
    expect(googleEnumLabel("countingType", "ONE_PER_CLICK", t)).toBe(
      "googleAds.enums.countingType.onePerClick",
    )
    expect(googleEnumLabel("actionStatus", "HIDDEN", t)).toBe(
      "googleAds.enums.actionStatus.hidden",
    )
  })

  test("falls back to a translated 'unknown' with the humanized raw value", () => {
    expect(googleEnumLabel("category", "BRAND_NEW_CATEGORY", t)).toBe(
      "googleAds.enums.unknown:Brand new category",
    )
  })

  test("never resolves Object.prototype members as known values", () => {
    expect(googleEnumLabel("actionStatus", "constructor", t)).toBe(
      "googleAds.enums.unknown:Constructor",
    )
  })
})
