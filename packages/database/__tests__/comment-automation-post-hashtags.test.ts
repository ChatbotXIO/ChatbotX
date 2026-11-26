import { describe, expect, test } from "vitest"
import {
  captionHasAnyHashtag,
  extractCaptionHashtags,
  isValidCommentPostHashtag,
  normalizeCommentPostHashtag,
  normalizeCommentPostHashtags,
} from "../src/partials/comment-automation"

describe("normalizeCommentPostHashtag", () => {
  test("drops the leading #, trims and lower-cases", () => {
    expect(normalizeCommentPostHashtag("  #VIP ")).toBe("vip")
    expect(normalizeCommentPostHashtag("##Sale")).toBe("sale")
  })

  test("composes a decomposed Vietnamese tag (NFC)", () => {
    const decomposed = "khuyến".normalize("NFD")
    expect(normalizeCommentPostHashtag(`#${decomposed}`)).toBe(
      "khuyến".normalize("NFC"),
    )
  })
})

describe("isValidCommentPostHashtag", () => {
  test.each(["vip", "khuyếnmãi", "sale_2026", "新品"])("accepts %s", (tag) => {
    expect(isValidCommentPostHashtag(tag)).toBe(true)
  })

  test.each([
    "",
    "vip sale",
    "vip-2",
    "vip.",
    "a".repeat(101),
  ])("rejects %j", (tag) => {
    expect(isValidCommentPostHashtag(tag)).toBe(false)
  })
})

describe("normalizeCommentPostHashtags", () => {
  test("dedupes after normalizing and drops blanks, keeping order", () => {
    expect(
      normalizeCommentPostHashtags(["#VIP", "sale", "vip", " ", "#"]),
    ).toEqual(["vip", "sale"])
  })
})

describe("extractCaptionHashtags", () => {
  test("cuts a tag at punctuation and ignores case", () => {
    expect([
      ...extractCaptionHashtags("New drop #VIP! #sale, #Khuyến_Mãi."),
    ]).toEqual(["vip", "sale", "khuyến_mãi"])
  })

  test("a bare # or none at all yields nothing", () => {
    expect(extractCaptionHashtags("no tags # here").size).toBe(0)
  })
})

describe("captionHasAnyHashtag", () => {
  test("matches any listed tag", () => {
    expect(captionHasAnyHashtag("Deal #sale", ["vip", "sale"])).toBe(true)
  })

  test("is whole-tag: #vip2 and #vipmember do not match vip", () => {
    expect(captionHasAnyHashtag("#vip2 #vipmember", ["vip"])).toBe(false)
  })

  test("compares the target list in canonical form too", () => {
    expect(captionHasAnyHashtag("Ưu đãi #VIP", ["#Vip"])).toBe(true)
  })

  test("an empty caption matches nothing", () => {
    expect(captionHasAnyHashtag("", ["vip"])).toBe(false)
  })
})
