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

  test("keeps the email/id literal a contact-email family's argument predicate needs", () => {
    const cases = materializeMultilingualCases()
    const emailCases = cases.filter(
      (evalCase) => evalCase.family === "contact-email-get",
    )
    for (const evalCase of emailCases) {
      expect(evalCase.prompt, evalCase.id).toContain("ada@example.com")
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
