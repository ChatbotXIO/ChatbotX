// @vitest-environment node

import { describe, expect, test } from "vitest"
import {
  classifyStoreListingForLocale,
  normalizeListingLanguages,
  TEMPLATE_STORE_SEPARATE_LOCALE,
} from "../src/template/store-audience"

describe("classifyStoreListingForLocale", () => {
  test("a listing with no language shows at the top for everyone", () => {
    expect(classifyStoreListingForLocale([], "vi")).toBe("primary")
    expect(classifyStoreListingForLocale([], "en")).toBe("primary")
  })

  test("a listing tagged with the visitor's language shows at the top", () => {
    expect(classifyStoreListingForLocale(["vi"], "vi")).toBe("primary")
    expect(classifyStoreListingForLocale(["en", "fr"], "fr")).toBe("primary")
  })

  test("a Vietnamese visitor sees nothing but Vietnamese and untagged listings", () => {
    expect(classifyStoreListingForLocale(["en"], "vi")).toBe("hidden")
    expect(classifyStoreListingForLocale(["en", "fr"], "vi")).toBe("hidden")
    expect(classifyStoreListingForLocale(["vi", "en"], "vi")).toBe("primary")
  })

  test("another visitor sees other languages below, except Vietnamese ones", () => {
    expect(classifyStoreListingForLocale(["fr"], "en")).toBe("other")
    expect(classifyStoreListingForLocale(["fr", "de"], "en")).toBe("other")
    expect(classifyStoreListingForLocale(["vi"], "en")).toBe("hidden")
    expect(classifyStoreListingForLocale(["vi", "fr"], "en")).toBe("hidden")
  })

  test("a listing in Vietnamese and the visitor's language shows at the top", () => {
    expect(classifyStoreListingForLocale(["vi", "en"], "en")).toBe("primary")
  })

  test("matches the exact locale code, not the language family", () => {
    expect(classifyStoreListingForLocale(["pt-PT"], "pt-BR")).toBe("other")
    expect(classifyStoreListingForLocale(["zh-TW"], "zh-CN")).toBe("other")
    expect(classifyStoreListingForLocale(["pt-BR"], "pt-BR")).toBe("primary")
  })

  test("the separate locale is a named constant", () => {
    expect(TEMPLATE_STORE_SEPARATE_LOCALE).toBe("vi")
  })
})

describe("normalizeListingLanguages", () => {
  test("keeps valid codes and drops duplicates", () => {
    expect(normalizeListingLanguages(["en", "vi", "en"])).toEqual(["en", "vi"])
  })

  test("accepts an empty list", () => {
    expect(normalizeListingLanguages([])).toEqual([])
  })

  test("rejects an unknown code", () => {
    expect(() => normalizeListingLanguages(["en", "xx"])).toThrow()
    expect(() => normalizeListingLanguages(["EN"])).toThrow()
  })
})
