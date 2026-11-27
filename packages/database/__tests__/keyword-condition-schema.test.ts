import { describe, expect, test } from "vitest"
import {
  flattenKeywordConditionValues,
  MAX_KEYWORD_CONDITIONS,
  MAX_KEYWORD_REGEX_LENGTH,
} from "../src/partials/automated-response"
import {
  compileKeywordRegex,
  keywordConditionSchema,
  keywordConditionsSchema,
} from "../src/partials/keyword-condition-schema"

const issueMessages = (value: unknown) => {
  const result = keywordConditionSchema.safeParse(value)
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

describe("keywordConditionSchema", () => {
  test("requires values for operators that match keywords", () => {
    expect(issueMessages({ operator: "contains", values: [] })).toEqual([
      "keywordConditionValuesRequired",
    ])
    expect(issueMessages({ operator: "contains", values: ["giá"] })).toEqual([])
  })

  test("accepts containsAudio with no values and rejects values on it", () => {
    expect(issueMessages({ operator: "containsAudio", values: [] })).toEqual([])
    expect(issueMessages({ operator: "containsAudio", values: ["x"] })).toEqual(
      ["keywordConditionTakesNoValues"],
    )
  })

  test("rejects values on value-less operators", () => {
    expect(issueMessages({ operator: "containsImage", values: [] })).toEqual([])
    expect(issueMessages({ operator: "isThumbsUp", values: ["x"] })).toEqual([
      "keywordConditionTakesNoValues",
    ])
  })

  test("trims values and rejects blank ones", () => {
    const parsed = keywordConditionSchema.parse({
      operator: "is",
      values: ["  chào  "],
    })
    expect(parsed.values).toEqual(["chào"])
    expect(
      keywordConditionSchema.safeParse({ operator: "is", values: ["  "] })
        .success,
    ).toBe(false)
  })

  test("validates regex values with RE2 syntax", () => {
    expect(
      issueMessages({ operator: "matchesRegex", values: ["^order-\\d+$"] }),
    ).toEqual([])
    expect(
      issueMessages({ operator: "matchesRegex", values: ["(unclosed"] }),
    ).toEqual(["invalidKeywordRegex"])
    // Backreferences are not RE2 — rejected instead of failing at runtime.
    expect(
      issueMessages({ operator: "matchesRegex", values: ["(a)\\1"] }),
    ).toEqual(["invalidKeywordRegex"])
  })

  test("rejects unknown operators", () => {
    expect(
      keywordConditionSchema.safeParse({
        operator: "startsWith",
        values: ["a"],
      }).success,
    ).toBe(false)
  })
})

describe("keywordConditionsSchema", () => {
  test("needs at least one and at most the maximum number of conditions", () => {
    const condition = { operator: "containsLink", values: [] }
    expect(keywordConditionsSchema.safeParse([]).success).toBe(false)
    expect(keywordConditionsSchema.safeParse([condition]).success).toBe(true)
    expect(
      keywordConditionsSchema.safeParse(
        Array.from({ length: MAX_KEYWORD_CONDITIONS + 1 }, () => condition),
      ).success,
    ).toBe(false)
  })
})

describe("compileKeywordRegex", () => {
  test("is case-insensitive and refuses over-long patterns", () => {
    expect(compileKeywordRegex("abc")?.matcher("xABCx").find()).toBe(true)
    expect(compileKeywordRegex("a".repeat(MAX_KEYWORD_REGEX_LENGTH + 1))).toBe(
      null,
    )
  })
})

describe("flattenKeywordConditionValues", () => {
  test("lists each trigger keyword once in condition order", () => {
    expect(
      flattenKeywordConditionValues([
        { operator: "contains", values: ["a", "b"] },
        { operator: "containsVideo", values: [] },
        { operator: "containsAudio", values: [] },
        { operator: "beginsWith", values: ["b", "c"] },
      ]),
    ).toEqual(["a", "b", "c"])
  })

  test("leaves out excluded words and regex patterns", () => {
    expect(
      flattenKeywordConditionValues([
        { operator: "contains", values: ["mua"] },
        { operator: "notContains", values: ["spam"] },
        { operator: "matchesRegex", values: ["^a"] },
      ]),
    ).toEqual(["mua"])
  })
})
