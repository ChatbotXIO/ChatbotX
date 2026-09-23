import { describe, expect, test } from "vitest"
import { normalizeSearchText } from "../src/server/search/normalize"
import { expandSynonyms } from "../src/server/search/synonyms"

const expand = (text: string) => expandSynonyms(normalizeSearchText(text))

describe("expandSynonyms", () => {
  test("expands a Vietnamese verb+resource phrase to catalog concepts", () => {
    expect(expand("Tìm khách")).toEqual(
      expect.arrayContaining(["get", "list", "search", "contact"]),
    )
  })

  test("prefers the longer idiom over its shorter substring", () => {
    // "huy dang ky" (unsubscribe) must win over "huy" (cancel) and
    // "dang ky" (subscribe) separately -- the three mean opposite things.
    expect(expand("huy dang ky")).toEqual(["unsubscribe"])
  })

  test("maps unaccented tag removal to the tag concept only", () => {
    const expanded = expand("go nhan")
    expect(expanded).toEqual(expect.arrayContaining(["remove", "tag"]))
    expect(expanded).not.toContain("message")
  })

  test("subscribe phrase does not fire the cancel synonym", () => {
    expect(expand("dang ky")).toEqual(["subscribe"])
  })

  test("does not expand a bare single-syllable collision word", () => {
    // "An" is a person's name in the eval corpus, not the (excluded) verb
    // "view" -- it must pass through untouched, not become a synonym hit.
    expect(expand("an")).toEqual(["an"])
  })

  test("leaves already-English tokens untouched", () => {
    expect(expand("create vip tag")).toEqual(
      expect.arrayContaining(["create", "vip", "tag"]),
    )
  })

  test("resolves a phone-number phrase without touching the digits", () => {
    expect(expand("so dien thoai")).toEqual(["phone"])
  })
})
