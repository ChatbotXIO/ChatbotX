import { describe, expect, test } from "vitest"
import {
  keywordMatchesText,
  keywordMatchModeByAutomatedResponseType,
  matchesAnyKeywordRule,
} from "../src/keyword-match"

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

  test("exact mode requires the full text to equal a keyword", () => {
    expect(keywordMatchesText(["price"], "price", "exact")).toBe(true)
    expect(keywordMatchesText(["price"], "what is the price?", "exact")).toBe(
      false,
    )
  })

  test("exact mode is case-insensitive and trims whitespace", () => {
    expect(keywordMatchesText(["PRICE"], "  price  ", "exact")).toBe(true)
  })

  test("a whitespace-only keyword never matches, in either mode", () => {
    expect(keywordMatchesText([" "], "hello world", "contains")).toBe(false)
    expect(keywordMatchesText([" "], "", "exact")).toBe(false)
    expect(keywordMatchesText([" "], "   ", "exact")).toBe(false)
  })

  test("contains mode trims keyword whitespace before matching", () => {
    expect(keywordMatchesText([" price "], "the price is high")).toBe(true)
  })
})

describe("keywordMatchModeByAutomatedResponseType", () => {
  test("maps Contact rules to contains and Page rules to exact", () => {
    expect(keywordMatchModeByAutomatedResponseType.inbound).toBe("contains")
    expect(keywordMatchModeByAutomatedResponseType.outbound).toBe("exact")
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
