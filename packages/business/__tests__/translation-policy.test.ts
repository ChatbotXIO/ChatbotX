import { describe, expect, test } from "vitest"
import {
  isWithinChannelLimit,
  TRANSLATION_CHANNEL_MAX_LENGTH,
} from "../src/translation/channel-limits"
import {
  isReliableDetection,
  isSameLanguage,
  isTranslationEffective,
  languagePromptName,
  normalizeLanguageCode,
} from "../src/translation/language-policy"
import { isNoiseText } from "../src/translation/noise-filter"
import {
  maskFragments,
  restoreFragments,
  UnsafeTranslationOutputError,
} from "../src/translation/protect-fragments"
import { hashSourceText } from "../src/translation/source-hash"

describe("normalizeLanguageCode / isSameLanguage", () => {
  test.each([
    ["vi", "vi"],
    ["es-MX", "es"],
    ["pt_BR", "pt"],
    ["EN", "en"],
    ["zh", "zh-Hans"],
    ["zh-CN", "zh-Hans"],
    ["zh-Hans", "zh-Hans"],
    ["zh-TW", "zh-Hant"],
    ["zh-HK", "zh-Hant"],
    ["zh-Hant", "zh-Hant"],
    ["fil", "fil"],
    [" es ", "es"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeLanguageCode(input)).toBe(expected)
  })

  test.each([
    [""],
    ["und"],
    [null],
    [undefined],
    ["hello"],
    ["1234"],
    ["e"],
    ["english"],
    ["e1-US"],
  ])("%s is unknown", (input) => {
    expect(normalizeLanguageCode(input)).toBeNull()
  })

  test("compares by primary language, but Hans and Hant are different languages", () => {
    expect(isSameLanguage("pt-BR", "pt-PT")).toBe(true)
    expect(isSameLanguage("zh-CN", "zh-Hans")).toBe(true)
    expect(isSameLanguage("zh-CN", "zh-TW")).toBe(false)
    expect(isSameLanguage("es", "vi")).toBe(false)
    expect(isSameLanguage("und", "und")).toBe(false)
  })

  test("names a language in English for the prompt", () => {
    expect(languagePromptName("vi")).toBe("Vietnamese")
    expect(languagePromptName("zh-TW")).toContain("Traditional")
  })
})

describe("isReliableDetection", () => {
  const detected = (language: string, confidence = 0.95) => ({
    detectedLanguage: language,
    confidence,
  })

  test('"ok thanks" does not set a language: too few words', () => {
    expect(isReliableDetection("ok thanks", detected("en"))).toBe(false)
  })

  test.each([
    ["làm sao?", "vi"],
    ["vâng ạ", "vi"],
    ["cảm ơn", "vi"],
    ["sao ạ", "vi"],
    ["안녕하세요", "ko"],
    ["привет", "ru"],
  ])('a short message with distinctive spelling ("%s") is reliable', (text, language) => {
    expect(isReliableDetection(text, detected(language))).toBe(true)
  })

  test.each([
    ["ok", "en"],
    ["no", "en"],
    ["how?", "en"],
    ["thanks", "en"],
    ["gracias", "es"],
    ["alo", "vi"],
    ["ship ko", "vi"],
    ["sí", "es"],
    ["ạ", "vi"],
  ])('a short ASCII or tiny message ("%s") never decides the language', (text, language) => {
    expect(isReliableDetection(text, detected(language, 1))).toBe(false)
  })

  test("distinctive spelling still needs the confidence", () => {
    expect(isReliableDetection("làm sao?", detected("vi", 0.79))).toBe(false)
    expect(isReliableDetection("làm sao?", detected("und"))).toBe(false)
  })

  test("a message of three words is reliable", () => {
    expect(isReliableDetection("quiero cambiar talla", detected("es"))).toBe(
      true,
    )
  })

  test("low confidence is never reliable", () => {
    expect(
      isReliableDetection("quiero cambiar la talla", detected("es", 0.79)),
    ).toBe(false)
    expect(
      isReliableDetection("quiero cambiar la talla", detected("es", 0.8)),
    ).toBe(true)
  })

  test("an unknown language is never reliable", () => {
    expect(
      isReliableDetection("quiero cambiar la talla", detected("und")),
    ).toBe(false)
  })

  test("unspaced languages are judged by characters: 12 characters of zh is reliable", () => {
    expect(
      isReliableDetection("我想更换衣服的尺码谢谢你们", detected("zh")),
    ).toBe(true)
    expect(isReliableDetection("我想更换尺码", detected("zh"))).toBe(false)
  })
})

describe("isTranslationEffective", () => {
  test.each([
    [{ workspaceEnabled: true }, true],
    [{ workspaceEnabled: true, enabledOverride: true }, true],
    [{ workspaceEnabled: true, enabledOverride: false }, false],
    [{ workspaceEnabled: true, enabledOverride: null }, true],
    [{ workspaceEnabled: false }, false],
    // The override cannot enable a workspace that is off.
    [{ workspaceEnabled: false, enabledOverride: true }, false],
  ])("%j -> %s", (flags, expected) => {
    expect(isTranslationEffective(flags)).toBe(expected)
  })
})

describe("isNoiseText", () => {
  test.each([
    [""],
    ["   "],
    [null],
    ["👍"],
    ["😂😂😂"],
    ["..."],
    ["12345"],
    ["https://example.com/a?b=1"],
    ["www.example.com"],
    ["ok"],
    ["OK!"],
    ["k"],
  ])("%j is noise", (text) => {
    expect(isNoiseText(text)).toBe(true)
  })

  test.each([
    ["gracias"],
    ["hola"],
    ["ok thanks"],
    ["mira https://example.com por favor"],
    ["我想换货"],
  ])("%j is not noise", (text) => {
    expect(isNoiseText(text)).toBe(false)
  })
})

describe("maskFragments / restoreFragments", () => {
  test("masks URLs, emails, variables, code and mentions, and restores them", () => {
    const text =
      "Mira https://example.com/a?b=1, escribe a juan@example.com {{name}} `npm i` @maria."
    const { masked, fragments } = maskFragments(text)

    expect(fragments).toEqual([
      "https://example.com/a?b=1",
      "juan@example.com",
      "{{name}}",
      "`npm i`",
      "@maria.",
    ])
    expect(masked).not.toContain("example.com")
    expect(restoreFragments(masked, fragments)).toBe(text)
  })

  test("does not swallow the punctuation after a URL", () => {
    const { fragments } = maskFragments("ver https://example.com.")
    expect(fragments).toEqual(["https://example.com"])
  })

  test("text with nothing to protect is unchanged", () => {
    expect(maskFragments("hola mundo")).toEqual({
      masked: "hola mundo",
      fragments: [],
    })
  })

  test("a placeholder the customer typed is protected, so it cannot forge one", () => {
    const { masked, fragments } = maskFragments("hola ⟦7⟧")
    expect(fragments).toEqual(["⟦7⟧"])
    expect(restoreFragments(masked, fragments)).toBe("hola ⟦7⟧")
  })

  test("a translation may move placeholders", () => {
    expect(restoreFragments("⟦2⟧ y ⟦1⟧", ["a", "b"])).toBe("b y a")
  })

  test.each([
    ["missing", "solo ⟦1⟧", ["a", "b"]],
    ["duplicated", "⟦1⟧ ⟦1⟧", ["a"]],
    ["unknown", "⟦1⟧ ⟦9⟧", ["a"]],
    ["unknown index zero", "⟦0⟧", []],
  ])("a %s placeholder is unsafeOutput", (_name, translated, fragments) => {
    expect(() => restoreFragments(translated, fragments)).toThrow(
      UnsafeTranslationOutputError,
    )
  })
})

describe("channel limits", () => {
  test("every channel has a positive limit", () => {
    for (const limit of Object.values(TRANSLATION_CHANNEL_MAX_LENGTH)) {
      expect(limit).toBeGreaterThan(0)
    }
  })

  test("a translation over the limit is rejected", () => {
    expect(isWithinChannelLimit("instagram", "a".repeat(1000))).toBe(true)
    expect(isWithinChannelLimit("instagram", "a".repeat(1001))).toBe(false)
  })
})

const BASE64URL_128_BITS = /^[A-Za-z0-9_-]{22}$/u

describe("hashSourceText", () => {
  test("is 22 base64url characters and deterministic", async () => {
    const hash = await hashSourceText("hola")
    expect(hash).toMatch(BASE64URL_128_BITS)
    expect(await hashSourceText("hola")).toBe(hash)
  })

  test("changes when the text changes", async () => {
    expect(await hashSourceText("hola")).not.toBe(await hashSourceText("hola!"))
  })
})

describe("isWithinChannelLimit with a channel the table does not know", () => {
  test("uses the strictest known limit", () => {
    expect(isWithinChannelLimit("some-new-channel", "a".repeat(1000))).toBe(
      true,
    )
    expect(isWithinChannelLimit("some-new-channel", "a".repeat(1001))).toBe(
      false,
    )
  })
})
