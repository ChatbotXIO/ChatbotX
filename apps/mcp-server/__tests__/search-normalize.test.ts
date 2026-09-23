import { describe, expect, test } from "vitest"
import {
  normalizeSearchText,
  stem,
  stripLiterals,
  tokenize,
} from "../src/server/search/normalize"

describe("normalizeSearchText", () => {
  test("strips Vietnamese diacritics and lowercases", () => {
    expect(normalizeSearchText("Tìm Khách Hàng")).toBe("tim khach hang")
  })

  test("normalizes the đ/Đ letter to d", () => {
    expect(normalizeSearchText("Đăng ký")).toBe("dang ky")
  })
})

describe("stripLiterals", () => {
  test("replaces an email address with a contact/email hint", () => {
    expect(stripLiterals("Find ada@example.com")).toBe("Find  contact email ")
  })

  test("replaces a phone number with a contact/phone hint", () => {
    expect(stripLiterals("Tìm khách số +841234567890")).toBe(
      "Tìm khách số  contact phone ",
    )
  })

  test("replaces a bare numeric id with an id hint", () => {
    expect(stripLiterals("Cancel appointment 99")).toBe(
      "Cancel appointment  id ",
    )
  })

  test("does not touch ordinary words", () => {
    expect(stripLiterals("Create VIP tag")).toBe("Create VIP tag")
  })
})

describe("stem", () => {
  test("folds a plural onto its singular", () => {
    expect(stem("flows")).toBe("flow")
    expect(stem("tags")).toBe("tag")
    expect(stem("contacts")).toBe("contact")
  })

  test("leaves a short word ending in s untouched", () => {
    expect(stem("vs")).toBe("vs")
  })
})

describe("tokenize", () => {
  test("deduplicates and lowercases tokens", () => {
    expect(tokenize("Tags tags TAGS")).toEqual(["tags"])
  })
})
