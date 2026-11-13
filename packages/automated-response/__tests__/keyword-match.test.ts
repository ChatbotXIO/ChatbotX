import type { KeywordCondition } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import {
  isKeywordMediaFileType,
  type KeywordMatchInput,
  keywordConditionMatches,
  keywordMatchesText,
  keywordMatchModeByAutomatedResponseType,
  matchesAnyKeywordRule,
  ruleMatchesMessage,
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

const textInput = (text: string | null): KeywordMatchInput => ({
  text,
  attachmentFileTypes: [],
})

const inboundRule = (conditions: KeywordCondition[] | null) => ({
  keywords: [],
  conditions,
  type: "inbound" as const,
})

const matchesCondition = (
  condition: KeywordCondition,
  input: string | KeywordMatchInput,
) =>
  keywordConditionMatches(
    condition,
    typeof input === "string" ? textInput(input) : input,
  )

describe("matchesAnyKeywordRule", () => {
  test("matches when any rule contains a matching keyword", () => {
    expect(
      matchesAnyKeywordRule(textInput("I need support"), [
        { keywords: ["pricing"], conditions: null, type: "inbound" },
        { keywords: ["support"], conditions: null, type: "inbound" },
      ]),
    ).toBe(true)
  })

  test("returns false for empty rules or rules without keywords", () => {
    expect(matchesAnyKeywordRule(textInput("hello"), [])).toBe(false)
    expect(
      matchesAnyKeywordRule(textInput("hello"), [
        { keywords: [], conditions: null, type: "inbound" },
      ]),
    ).toBe(false)
  })
})

describe("ruleMatchesMessage", () => {
  test("rules without conditions keep the legacy contains/exact modes", () => {
    const legacyInbound = { keywords: ["test"], conditions: null }
    expect(
      ruleMatchesMessage(
        { ...legacyInbound, type: "inbound" },
        textInput("htest1"),
      ),
    ).toBe(true)
    expect(
      ruleMatchesMessage(
        { ...legacyInbound, type: "outbound" },
        textInput("htest1"),
      ),
    ).toBe(false)
    expect(
      ruleMatchesMessage(
        { ...legacyInbound, type: "outbound" },
        textInput(" TEST "),
      ),
    ).toBe(true)
  })

  test("ANDs conditions and ORs the values inside one condition", () => {
    const rule = inboundRule([
      { operator: "contains", values: ["muốn", "quan tâm"] },
      { operator: "containsWholeWord", values: ["ok"] },
      { operator: "notContains", values: ["test"] },
    ])
    expect(ruleMatchesMessage(rule, textInput("Mình quan tâm, ok bạn"))).toBe(
      true,
    )
    expect(ruleMatchesMessage(rule, textInput("muon mua ok"))).toBe(true)
    expect(ruleMatchesMessage(rule, textInput("muốn mua book"))).toBe(false)
    expect(ruleMatchesMessage(rule, textInput("muốn ok test"))).toBe(false)
  })

  test("an attachment-only message only matches attachment conditions", () => {
    const imageOnly: KeywordMatchInput = {
      text: null,
      attachmentFileTypes: ["image"],
    }
    expect(
      ruleMatchesMessage(
        inboundRule([{ operator: "containsImage", values: [] }]),
        imageOnly,
      ),
    ).toBe(true)
    expect(
      ruleMatchesMessage(
        inboundRule([{ operator: "contains", values: ["hi"] }]),
        imageOnly,
      ),
    ).toBe(false)
  })

  describe("audio-only message (no text)", () => {
    const audioOnly: KeywordMatchInput = {
      text: null,
      attachmentFileTypes: ["audio"],
    }
    const containsAudio: KeywordCondition = {
      operator: "containsAudio",
      values: [],
    }

    test("matches a rule with a containsAudio condition", () => {
      expect(ruleMatchesMessage(inboundRule([containsAudio]), audioOnly)).toBe(
        true,
      )
    })

    test("does not match rules that only negate text", () => {
      expect(
        ruleMatchesMessage(
          inboundRule([{ operator: "notContains", values: ["stop"] }]),
          audioOnly,
        ),
      ).toBe(false)
      expect(
        ruleMatchesMessage(
          inboundRule([{ operator: "matchesRegex", values: [".*"] }]),
          audioOnly,
        ),
      ).toBe(false)
    })

    test("needs every condition of a rule that has containsAudio", () => {
      expect(
        ruleMatchesMessage(
          inboundRule([
            containsAudio,
            { operator: "notContains", values: ["stop"] },
          ]),
          audioOnly,
        ),
      ).toBe(true)
      expect(
        ruleMatchesMessage(
          inboundRule([
            containsAudio,
            { operator: "contains", values: ["hi"] },
          ]),
          audioOnly,
        ),
      ).toBe(false)
    })

    test("does not match legacy keyword rules without conditions", () => {
      expect(
        ruleMatchesMessage(
          { keywords: ["hi"], conditions: null, type: "inbound" },
          audioOnly,
        ),
      ).toBe(false)
    })

    test("a rule with only image/video conditions ignores it", () => {
      expect(
        ruleMatchesMessage(
          inboundRule([{ operator: "containsImage", values: [] }]),
          audioOnly,
        ),
      ).toBe(false)
      expect(
        ruleMatchesMessage(
          inboundRule([{ operator: "containsVideo", values: [] }]),
          audioOnly,
        ),
      ).toBe(false)
    })

    test("audio with text is not audio-only, so text rules still apply", () => {
      const audioWithText: KeywordMatchInput = {
        text: "nghe nè",
        attachmentFileTypes: ["audio"],
      }
      expect(
        ruleMatchesMessage(
          inboundRule([{ operator: "notContains", values: ["stop"] }]),
          audioWithText,
        ),
      ).toBe(true)
      expect(
        ruleMatchesMessage(
          inboundRule([{ operator: "contains", values: ["nghe"] }]),
          audioWithText,
        ),
      ).toBe(true)
      expect(
        ruleMatchesMessage(inboundRule([containsAudio]), audioWithText),
      ).toBe(true)
    })

    test("audio plus an image without text is not audio-only", () => {
      expect(
        ruleMatchesMessage(
          inboundRule([{ operator: "notContains", values: ["stop"] }]),
          { text: null, attachmentFileTypes: ["audio", "image"] },
        ),
      ).toBe(true)
    })

    test("a plain file next to the audio keeps it audio-only", () => {
      const audioWithFile: KeywordMatchInput = {
        text: null,
        attachmentFileTypes: ["audio", "file"],
      }
      expect(
        ruleMatchesMessage(
          inboundRule([{ operator: "notContains", values: ["stop"] }]),
          audioWithFile,
        ),
      ).toBe(false)
      expect(
        ruleMatchesMessage(inboundRule([containsAudio]), audioWithFile),
      ).toBe(true)
    })

    test("a whitespace-only caption counts as no text", () => {
      const audioWithBlankCaption: KeywordMatchInput = {
        text: "  \n ",
        attachmentFileTypes: ["audio"],
      }
      expect(
        ruleMatchesMessage(
          inboundRule([{ operator: "notContains", values: ["stop"] }]),
          audioWithBlankCaption,
        ),
      ).toBe(false)
      expect(
        ruleMatchesMessage(inboundRule([containsAudio]), audioWithBlankCaption),
      ).toBe(true)
    })
  })

  // Pinned on purpose: text-negating operators have always matched an empty
  // text, so image/video-only messages still match them. Only audio is opt-in.
  test("image/video-only messages still match text-negating rules", () => {
    for (const fileType of ["image", "gif", "video"] as const) {
      const input: KeywordMatchInput = {
        text: null,
        attachmentFileTypes: [fileType],
      }
      expect(
        ruleMatchesMessage(
          inboundRule([{ operator: "notContains", values: ["stop"] }]),
          input,
        ),
      ).toBe(true)
      expect(
        ruleMatchesMessage(
          inboundRule([{ operator: "matchesRegex", values: [".*"] }]),
          input,
        ),
      ).toBe(true)
    }
  })
})

describe("keywordConditionMatches", () => {
  test("ignores case and Vietnamese accents", () => {
    expect(
      matchesCondition(
        { operator: "contains", values: ["Tư Vấn"] },
        "cần tu van",
      ),
    ).toBe(true)
    expect(
      matchesCondition(
        { operator: "is", values: ["đặt hàng"] },
        "  DAT   hang ",
      ),
    ).toBe(true)
    expect(
      matchesCondition(
        { operator: "is", values: ["đặt hàng"] },
        "đặt hàng nhé",
      ),
    ).toBe(false)
  })

  test("similarTo tolerates small typos but not different messages", () => {
    const condition: KeywordCondition = {
      operator: "similarTo",
      values: ["tư vấn giúp mình"],
    }
    expect(matchesCondition(condition, "tu vaan giup minh")).toBe(true)
    expect(matchesCondition(condition, "giá bao nhiêu")).toBe(false)
  })

  test("similarTo allows one edit per five characters, no more", () => {
    const condition: KeywordCondition = {
      operator: "similarTo",
      values: ["abcdefghij"],
    }
    expect(matchesCondition(condition, "abcdefghxy")).toBe(true)
    expect(matchesCondition(condition, "abcdefgxyz")).toBe(false)
    expect(matchesCondition(condition, "abcdefghij and much more")).toBe(false)
  })

  test("matchesRegex reuses a compiled pattern across messages", () => {
    const condition: KeywordCondition = {
      operator: "matchesRegex",
      values: ["^m(a|ã) ?\\d+$"],
    }
    expect(matchesCondition(condition, "MA 12")).toBe(true)
    expect(matchesCondition(condition, "mã12")).toBe(true)
    expect(matchesCondition(condition, "ma x")).toBe(false)
  })

  test("containsWholeWord respects word boundaries", () => {
    const condition: KeywordCondition = {
      operator: "containsWholeWord",
      values: ["ok"],
    }
    expect(matchesCondition(condition, "ok bạn")).toBe(true)
    expect(matchesCondition(condition, "vậy, OK!")).toBe(true)
    expect(matchesCondition(condition, "book")).toBe(false)
    expect(
      matchesCondition(
        { operator: "containsWholeWord", values: ["giá sỉ"] },
        "cho xin gia si nhé",
      ),
    ).toBe(true)
  })

  test("beginsWith and endsWith", () => {
    expect(
      matchesCondition(
        { operator: "beginsWith", values: ["chào"] },
        "Chao shop",
      ),
    ).toBe(true)
    expect(
      matchesCondition(
        { operator: "beginsWith", values: ["chào"] },
        "shop chào",
      ),
    ).toBe(false)
    expect(
      matchesCondition(
        { operator: "endsWith", values: ["nhé"] },
        "gửi giúp nhe",
      ),
    ).toBe(true)
  })

  test("notContains requires none of the values", () => {
    const condition: KeywordCondition = {
      operator: "notContains",
      values: ["test", "spam"],
    }
    expect(matchesCondition(condition, "hello")).toBe(true)
    expect(matchesCondition(condition, "this is spam")).toBe(false)
  })

  test("detects phone numbers, emails and links", () => {
    const phone: KeywordCondition = { operator: "containsPhone", values: [] }
    const email: KeywordCondition = { operator: "containsEmail", values: [] }
    const link: KeywordCondition = { operator: "containsLink", values: [] }
    expect(matchesCondition(phone, "sđt của mình 0912 345 678")).toBe(true)
    expect(matchesCondition(phone, "mình muốn mua 2 cái")).toBe(false)
    expect(matchesCondition(email, "mail: An.Nguyen@example.com")).toBe(true)
    expect(matchesCondition(email, "không có mail")).toBe(false)
    expect(matchesCondition(link, "xem https://shop.vn/a")).toBe(true)
    expect(matchesCondition(link, "vào example.com nhé")).toBe(true)
    expect(matchesCondition(link, "không có link")).toBe(false)
  })

  test("detects image and video attachments", () => {
    const withFiles = (
      attachmentFileTypes: KeywordMatchInput["attachmentFileTypes"],
    ) => ({
      text: "xem nè",
      attachmentFileTypes,
    })
    const image: KeywordCondition = { operator: "containsImage", values: [] }
    const video: KeywordCondition = { operator: "containsVideo", values: [] }
    expect(matchesCondition(image, withFiles(["image"]))).toBe(true)
    expect(matchesCondition(image, withFiles(["gif"]))).toBe(true)
    expect(matchesCondition(image, withFiles(["video"]))).toBe(false)
    expect(matchesCondition(video, withFiles(["video"]))).toBe(true)
    expect(matchesCondition(video, withFiles([]))).toBe(false)
  })

  test("detects audio attachments and keeps the media kinds apart", () => {
    const withFiles = (
      attachmentFileTypes: KeywordMatchInput["attachmentFileTypes"],
    ) => ({
      text: "nghe nè",
      attachmentFileTypes,
    })
    const audio: KeywordCondition = { operator: "containsAudio", values: [] }
    const image: KeywordCondition = { operator: "containsImage", values: [] }
    const video: KeywordCondition = { operator: "containsVideo", values: [] }
    expect(matchesCondition(audio, withFiles(["audio"]))).toBe(true)
    expect(matchesCondition(audio, withFiles(["image"]))).toBe(false)
    expect(matchesCondition(audio, withFiles(["gif"]))).toBe(false)
    expect(matchesCondition(audio, withFiles(["video"]))).toBe(false)
    expect(matchesCondition(audio, withFiles(["file"]))).toBe(false)
    expect(matchesCondition(audio, withFiles([]))).toBe(false)
    expect(matchesCondition(image, withFiles(["audio"]))).toBe(false)
    expect(matchesCondition(video, withFiles(["audio"]))).toBe(false)
  })

  test("isKeywordMediaFileType accepts image, gif, video and audio only", () => {
    for (const fileType of ["image", "gif", "video", "audio"] as const) {
      expect(isKeywordMediaFileType(fileType)).toBe(true)
    }
    expect(isKeywordMediaFileType("file")).toBe(false)
  })

  test("isThumbsUp accepts only thumbs-up emoji in any skin tone", () => {
    const condition: KeywordCondition = { operator: "isThumbsUp", values: [] }
    expect(matchesCondition(condition, "👍")).toBe(true)
    expect(matchesCondition(condition, " 👍🏽👍 ")).toBe(true)
    expect(matchesCondition(condition, "👍 ok")).toBe(false)
    expect(matchesCondition(condition, "")).toBe(false)
  })

  test("matchesRegex is case-insensitive and safe from catastrophic backtracking", () => {
    expect(
      matchesCondition(
        { operator: "matchesRegex", values: ["^order-\\d+$"] },
        "ORDER-123",
      ),
    ).toBe(true)
    const startedAt = Date.now()
    // The message ends in "b", so `$` must not match — the whole message is
    // checked, and RE2 still finishes in linear time.
    expect(
      matchesCondition(
        { operator: "matchesRegex", values: ["(a+)+$"] },
        `${"a".repeat(5000)}b`,
      ),
    ).toBe(false)
    expect(
      matchesCondition(
        { operator: "matchesRegex", values: ["^\\d+$"] },
        "1".repeat(3000),
      ),
    ).toBe(true)
    expect(
      matchesCondition(
        { operator: "matchesRegex", values: ["^\\d+$"] },
        `${"1".repeat(3000)}x`,
      ),
    ).toBe(false)
    expect(Date.now() - startedAt).toBeLessThan(1000)
    expect(
      matchesCondition(
        { operator: "matchesRegex", values: ["(unclosed"] },
        "x",
      ),
    ).toBe(false)
  })
})
