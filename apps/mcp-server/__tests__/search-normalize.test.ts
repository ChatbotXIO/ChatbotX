import { describe, expect, test } from "vitest"
import {
  containsNonLatinScript,
  looksNonEnglish,
  normalizeSearchText,
  stem,
  stripLiterals,
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

  test("replaces an ISO date with a date hint before phone detection", () => {
    expect(stripLiterals("analytics from 2026-09-01")).toBe(
      "analytics from  date ",
    )
  })

  test("keeps spaced numeric literals as separate id hints", () => {
    expect(stripLiterals("cancel 123 456")).toBe("cancel  id   id ")
  })

  test("does not classify spaced numeric values as a phone number", () => {
    expect(stripLiterals("reply 41 2026 done")).not.toContain("phone")
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

describe("looksNonEnglish", () => {
  test("detects accented Vietnamese and CJK queries", () => {
    expect(looksNonEnglish("gắn nhãn cho khách hàng")).toBe(true)
    expect(looksNonEnglish("给联系人打标签")).toBe(true)
  })

  test("does not flag unaccented Vietnamese or English", () => {
    expect(looksNonEnglish("Gan nhan khach hang")).toBe(false)
    expect(looksNonEnglish("add tag to contact")).toBe(false)
  })
})

describe("containsNonLatinScript", () => {
  test("returns false for plain English", () => {
    expect(containsNonLatinScript("add tag to contact")).toBe(false)
  })

  test("returns false for Vietnamese with precomposed diacritics", () => {
    expect(containsNonLatinScript("gắn nhãn cho khách hàng")).toBe(false)
  })

  test("returns false for Vietnamese written without diacritics", () => {
    expect(containsNonLatinScript("Dang ky sequence cho khach")).toBe(false)
  })

  test("returns false for emoji/symbols with no letters", () => {
    expect(containsNonLatinScript("😀🎉 #1")).toBe(false)
  })

  test("returns true for Arabic script", () => {
    expect(containsNonLatinScript("أضف علامة إلى جهة الاتصال")).toBe(true)
  })

  test("returns true for Chinese script", () => {
    expect(containsNonLatinScript("给联系人打标签")).toBe(true)
  })

  test("returns true for Cyrillic script", () => {
    expect(containsNonLatinScript("добавить тег контакту")).toBe(true)
  })

  test("returns true for Thai script", () => {
    expect(containsNonLatinScript("ติดแท็กผู้ติดต่อ")).toBe(true)
  })

  test("returns true for Korean script", () => {
    expect(containsNonLatinScript("연락처에 태그 추가")).toBe(true)
  })

  test("returns true when a non-Latin query mixes in an English word", () => {
    expect(containsNonLatinScript("给联系人加 tag")).toBe(true)
  })
})
