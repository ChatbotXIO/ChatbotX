import { describe, expect, test } from "vitest"
import {
  countUniqueLinks,
  describePublishingRules,
  MAX_POST_PARTS,
  measureText,
  normalisePublishTarget,
  type PartInput,
  partsRuleFor,
  threadsTextLength,
  validateParts,
} from "../src/post-publishing"
import type { SocialProvider } from "../src/social-account"

const threadPart = (text: string): PartInput => ({ kind: "threadPart", text })
const comment = (text: string): PartInput => ({ kind: "firstComment", text })

describe("parts capability per network", () => {
  test.each([
    ["threads", { firstComment: true, maxPartChars: 500, maxParts: 10 }],
    // The comment endpoints of these networks are not verified in the official
    // docs: parts stay off rather than guessed.
    ["facebook", null],
    ["instagram", null],
    ["tiktok", null],
  ] as const)("%s", (provider, expected) => {
    expect(partsRuleFor(provider)).toEqual(expected)
    expect(
      describePublishingRules().find((rules) => rules.provider === provider)
        ?.parts,
    ).toEqual(expected)
  })

  test("the cap on follow-ups is ten", () => {
    expect(MAX_POST_PARTS).toBe(10)
  })
})

describe("Threads text unit: 500, an emoji counts as its UTF-8 bytes", () => {
  test.each([
    ["plain text counts characters", "hello", 5],
    ["a 4-byte emoji counts 4", "😀", 4],
    ["a 3-byte symbol emoji counts 3", "❤️", 6],
    ["mixed", "hi 😀!", 3 + 4 + 1],
    ["accents are one each", "café", 4],
  ])("%s", (_label, text, expected) => {
    expect(threadsTextLength(text)).toBe(expected)
  })

  test("only Threads uses it", () => {
    expect(measureText("threads", "😀")).toBe(4)
    for (const provider of [
      "facebook",
      "instagram",
      "tiktok",
    ] as SocialProvider[]) {
      expect(measureText(provider, "😀")).toBe(2)
    }
  })

  test("the head text is checked in the unit too: 125 emoji (500 bytes) fit, 126 do not", () => {
    const head = (text: string) =>
      normalisePublishTarget({
        contentType: "text",
        linkUrl: null,
        media: [],
        options: {},
        provider: "threads",
        text,
      }).issues.map((issue) => issue.code)

    expect(head("😀".repeat(125))).toEqual([])
    expect(head("😀".repeat(126))).toEqual(["textTooLong"])
    expect(head("a".repeat(500))).toEqual([])
  })
})

describe("validateParts", () => {
  test("no parts, no issues, on any network", () => {
    for (const provider of ["facebook", "threads"] as SocialProvider[]) {
      expect(validateParts(provider, [])).toEqual([])
    }
  })

  test("a network without thread parts or a first comment says so, naming the field", () => {
    expect(validateParts("facebook", [threadPart("a"), comment("c")])).toEqual([
      expect.objectContaining({ code: "partsNotSupported", field: "parts" }),
      expect.objectContaining({
        code: "firstCommentNotSupported",
        field: "firstComment.text",
        partIndex: 1,
      }),
    ])
  })

  test("Threads accepts ten follow-ups, the eleventh is too many", () => {
    const ten = Array.from({ length: 10 }, () => threadPart("x"))
    expect(validateParts("threads", ten)).toEqual([])
    expect(
      validateParts("threads", [...ten, comment("c")]).map((i) => i.code),
    ).toEqual(["tooManyParts"])
  })

  test("a part is named by its index: empty and over the limit", () => {
    expect(
      validateParts("threads", [
        threadPart("ok"),
        threadPart("   "),
        threadPart("x".repeat(501)),
        comment("y".repeat(501)),
      ]),
    ).toEqual([
      expect.objectContaining({
        code: "partTextRequired",
        field: "parts[1].text",
        partIndex: 1,
      }),
      expect.objectContaining({
        code: "partTextTooLong",
        field: "parts[2].text",
        partIndex: 2,
      }),
      expect.objectContaining({
        code: "partTextTooLong",
        field: "firstComment.text",
        partIndex: 3,
      }),
    ])
  })

  test("a part with emoji is counted in bytes", () => {
    expect(validateParts("threads", [threadPart("😀".repeat(125))])).toEqual([])
    expect(
      validateParts("threads", [threadPart("😀".repeat(126))]).map(
        (i) => i.code,
      ),
    ).toEqual(["partTextTooLong"])
  })
})

describe("Threads link limit per part", () => {
  const links = (count: number): string =>
    Array.from({ length: count }, (_, i) => `https://a.example/${i}`).join(" ")

  test("a thread part and the first comment each carry their own five links", () => {
    expect(
      validateParts("threads", [threadPart(links(5)), comment(links(5))]),
    ).toEqual([])
  })

  test("a part with six links is named by its index", () => {
    expect(
      validateParts("threads", [
        threadPart("ok"),
        threadPart(links(6)),
        comment(links(6)),
      ]),
    ).toEqual([
      expect.objectContaining({
        code: "tooManyLinks",
        field: "parts[1].text",
        partIndex: 1,
      }),
      expect.objectContaining({
        code: "tooManyLinks",
        field: "firstComment.text",
        partIndex: 2,
      }),
    ])
  })
})

describe("countUniqueLinks", () => {
  test.each([
    [
      "six bare www links",
      "www.a.com www.b.com www.c.com www.d.com www.e.com www.f.com",
      6,
    ],
    [
      "host case is ignored",
      "https://A.com/x HTTPS://a.COM/x https://a.com/x",
      1,
    ],
    ["the path stays case-sensitive", "https://a.com/X https://a.com/x", 2],
    [
      "trailing punctuation is stripped",
      "see (https://a.com/x), https://a.com/x. and www.b.com!",
      2,
    ],
    ["a link without www or scheme is not counted", "visit a.com today", 0],
    ["a word merely ending in www is not a link", "awww.example", 0],
  ])("%s", (_name, text, expected) => {
    expect(countUniqueLinks(text)).toBe(expected)
  })
})
