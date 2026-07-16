import { describe, expect, test } from "vitest"
import { keywordMatchesText, matchesAnyKeywordRule } from "../src/keyword-match"

describe("keywordMatchesText", () => {
  test("matches keywords case-insensitively", () => {
    expect(keywordMatchesText(["PRICE"], "what is the price?")).toBe(true)
  })

  test("matches substrings to preserve automated response behavior", () => {
    expect(keywordMatchesText(["test"], "htest1")).toBe(true)
  })

  test("returns false for empty keyword lists", () => {
    expect(keywordMatchesText([], "hello")).toBe(false)
  })
})

describe("matchesAnyKeywordRule", () => {
  test("matches when any rule contains a matching keyword", () => {
    expect(
      matchesAnyKeywordRule("I need support", [
        { keywords: ["pricing"] },
        { keywords: ["support"] },
      ]),
    ).toBe(true)
  })

  test("returns false for empty rules or rules without keywords", () => {
    expect(matchesAnyKeywordRule("hello", [])).toBe(false)
    expect(matchesAnyKeywordRule("hello", [{ keywords: [] }])).toBe(false)
  })
})
