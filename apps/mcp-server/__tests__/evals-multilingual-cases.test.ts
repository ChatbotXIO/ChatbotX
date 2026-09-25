import { describe, expect, test } from "vitest"
import {
  type MultilingualLocale,
  materializeMultilingualCases,
  multilingualCorpusHash,
} from "../evals/cases-multilingual"

const LOCALES: MultilingualLocale[] = ["en", "vi-natural", "es", "zh", "fr"]

describe("materializeMultilingualCases", () => {
  test("gives every family a prompt in every locale", () => {
    const cases = materializeMultilingualCases()
    const families = [...new Set(cases.map((evalCase) => evalCase.family))]
    for (const family of families) {
      for (const locale of LOCALES) {
        const match = cases.find(
          (evalCase) =>
            evalCase.family === family && evalCase.locale === locale,
        )
        expect(match, `${family}/${locale}`).toBeDefined()
        expect(
          match?.prompt.trim().length,
          `${family}/${locale}`,
        ).toBeGreaterThan(0)
      }
    }
  })

  test("produces unique case ids", () => {
    const cases = materializeMultilingualCases()
    const ids = cases.map((evalCase) => evalCase.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test("freezes sixteen multilingual workflow families", () => {
    expect(materializeMultilingualCases()).toHaveLength(80)
  })

  test("defines sequence and measurable outcomes for every smoke case", () => {
    const cases = materializeMultilingualCases()
    for (const evalCase of cases) {
      expect(evalCase.expectedTools, evalCase.id).not.toHaveLength(0)
      if (evalCase.expectedOutcome === "complete") {
        expect(evalCase.sequence, evalCase.id).not.toHaveLength(0)
      }
      expect(
        evalCase.traceAssertions?.length ||
          evalCase.writeAssertions?.length ||
          evalCase.stateAssertions?.length,
        evalCase.id,
      ).toBeGreaterThan(0)
    }
  })

  test("permits direct tag assignment from a resolved identifier", () => {
    const tagCases = materializeMultilingualCases().filter(
      (evalCase) => evalCase.family === "contact-tag-clear",
    )

    for (const evalCase of tagCases) {
      expect(evalCase.sequence, evalCase.id).toEqual([
        ["contacts_add_tags_by_name"],
      ])
      expect(
        evalCase.argumentPredicates.find(
          (predicate) => predicate.key === "identifier",
        )?.includes,
        evalCase.id,
      ).toBeUndefined()
      expect(evalCase.forbiddenTools, evalCase.id).toEqual([
        "contacts_set_tags",
      ])
    }
  })

  test("does not require an optional folder when publishing a flow", () => {
    const flowCases = materializeMultilingualCases().filter(
      (evalCase) => evalCase.family === "flow-draft-validate-publish",
    )

    for (const evalCase of flowCases) {
      expect(evalCase.argumentPredicates, evalCase.id).toEqual([
        { key: "spec", tools: ["flows_publish"] },
      ])
    }
  })

  test("uses atomic locale-native discovery probes instead of full workflows", () => {
    const cases = materializeMultilingualCases()

    for (const evalCase of cases) {
      expect(evalCase.searchQueries, evalCase.id).toHaveLength(1)
      for (const expectedTool of evalCase.expectedTools) {
        expect(evalCase.searchQueries?.[0].expectedTools).toContain(
          expectedTool,
        )
      }
      expect(evalCase.searchQueries?.[0].query, evalCase.id).not.toBe(
        evalCase.prompt,
      )
    }
  })

  test("is deterministic for a fixed seed", () => {
    expect(multilingualCorpusHash(materializeMultilingualCases())).toBe(
      multilingualCorpusHash(materializeMultilingualCases()),
    )
  })

  test("does not put every family in the same split", () => {
    const cases = materializeMultilingualCases()
    const splits = new Set(cases.map((evalCase) => evalCase.split))
    expect(splits.has("tuning")).toBe(true)
  })
})
