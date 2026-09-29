import { describe, expect, test } from "vitest"
import { matchKeywords } from "../automation-matching"

describe("matchKeywords ignores accents and case", () => {
  test.each([
    ["café"],
    ["CAFÉ"],
    ["cafe"],
  ])("contain: cafe matches a comment that says %s", (word) => {
    expect(
      matchKeywords({ type: "contain", value: ["cafe"] }, [], `Quiero ${word}`),
    ).toBe(true)
  })
  test("equal: café matches a comment that says cafe", () => {
    expect(matchKeywords({ type: "equal", value: ["café"] }, [], "cafe")).toBe(
      true,
    )
  })
  test("excluded keywords are accent-insensitive too", () => {
    expect(
      matchKeywords({ type: "all", value: [] }, ["promoción"], "PROMOCION ya"),
    ).toBe(false)
  })
  test("Vietnamese typed without diacritics matches, including đ", () => {
    expect(
      matchKeywords({ type: "contain", value: ["giá"] }, [], "gia bao nhieu"),
    ).toBe(true)
    expect(
      matchKeywords({ type: "contain", value: ["dat hang"] }, [], "Đặt hàng"),
    ).toBe(true)
  })
  test("a keyword made of non-accent symbols is not normalized away", () => {
    expect(matchKeywords({ type: "contain", value: ["^^"] }, [], "hello")).toBe(
      false,
    )
    expect(matchKeywords({ type: "all", value: [] }, ["^^"], "hello")).toBe(
      true,
    )
  })
  test("marks outside the Latin combining-accent block are kept", () => {
    expect(matchKeywords({ type: "equal", value: ["ガ"] }, [], "カ")).toBe(
      false,
    )
  })
})
