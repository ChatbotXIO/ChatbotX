import { describe, expect, test } from "vitest"
import { normalizeForMatch } from "../src/normalize-for-match"

describe("normalizeForMatch", () => {
  test("folds case and Vietnamese diacritics", () => {
    expect(normalizeForMatch("Xin Chào ĐẸP")).toBe("xin chao dep")
  })

  test("treats accented and plain spellings as equal", () => {
    expect(normalizeForMatch("café")).toBe(normalizeForMatch("CAFE"))
  })

  test("keeps ASCII symbols that are not combining marks", () => {
    expect(normalizeForMatch("^^ `x`")).toBe("^^ `x`")
  })

  test("returns an empty string unchanged", () => {
    expect(normalizeForMatch("")).toBe("")
  })
})
