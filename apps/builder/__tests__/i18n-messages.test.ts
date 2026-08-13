// @vitest-environment node
import { readdirSync } from "node:fs"
import { describe, expect, test } from "vitest"
import {
  isLocale,
  type Locale,
  localeMeta,
  locales,
  resolveLocale,
} from "@/i18n/config"
import { getDirection } from "@/i18n/direction"
import { messagesByLocale } from "@/i18n/messages"

type FlatMessages = Record<string, unknown>

const flattenMessages = (
  value: unknown,
  prefix = "",
  result: FlatMessages = {},
): FlatMessages => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    result[prefix] = value
    return result
  }

  for (const [key, child] of Object.entries(value)) {
    flattenMessages(child, prefix ? `${prefix}.${key}` : key, result)
  }
  return result
}

const englishMessages = flattenMessages(messagesByLocale.en)
const englishKeys = Object.keys(englishMessages).sort()
const placeholderPattern = /\{[A-Za-z][\w.-]*\}/g
const forbiddenGeneratedTokenPattern = /⟪TK\d+⟫|\bTK\d+\b|ROW_/
const icuHeaderPattern =
  /\{([A-Za-z][\w.-]*),\s*(plural|select|selectordinal)\s*,/g
const icuCategoryPattern = /^\s*(=?[\w-]+)\s*\{/
const zeroWidthPattern = /\u200b|\u200c|\u200d|\ufeff/
const completeCatalogLocales = ["en", "vi"] as const
const cjkCatalogLocales = ["zh-TW", "zh-CN"].filter((locale) =>
  isLocale(locale),
)
const expectedSimplifiedChineseLocale = isLocale("zh-CN") ? "zh-CN" : "en"

type IcuStructure = {
  argument: string
  categories: string[]
  keyword: string
}

const getIcuStructures = (message: string): IcuStructure[] => {
  const structures: IcuStructure[] = []

  for (const match of message.matchAll(icuHeaderPattern)) {
    const bodyStart = (match.index ?? 0) + match[0].length
    let depth = 1
    let bodyEnd = bodyStart

    while (bodyEnd < message.length && depth > 0) {
      if (message[bodyEnd] === "{") {
        depth += 1
      } else if (message[bodyEnd] === "}") {
        depth -= 1
      }
      bodyEnd += 1
    }

    const body = message.slice(bodyStart, bodyEnd - 1)
    const categories: string[] = []
    let branchDepth = 0
    let cursor = 0

    while (cursor < body.length) {
      if (branchDepth === 0) {
        const category = body.slice(cursor).match(icuCategoryPattern)
        if (category) {
          categories.push(category[1])
          cursor += category[0].length
          branchDepth = 1
          continue
        }
      }

      if (body[cursor] === "{") {
        branchDepth += 1
      } else if (body[cursor] === "}") {
        branchDepth -= 1
      }
      cursor += 1
    }

    structures.push({
      argument: match[1],
      keyword: match[2],
      categories,
    })
  }

  return structures
}

describe("builder message catalogs", () => {
  test.each(
    completeCatalogLocales,
  )("%s has the exact English key set", (locale) => {
    expect(
      Object.keys(flattenMessages(messagesByLocale[locale])).sort(),
    ).toEqual(englishKeys)
  })

  test.each(
    locales,
  )("%s does not define keys missing from English", (locale) => {
    const translatedKeys = Object.keys(
      flattenMessages(messagesByLocale[locale]),
    ).sort()

    expect(translatedKeys.filter((key) => !englishKeys.includes(key))).toEqual(
      [],
    )
  })

  test.each(locales)("%s preserves placeholders byte-for-byte", (locale) => {
    const translatedMessages = flattenMessages(messagesByLocale[locale])

    for (const [key, englishValue] of Object.entries(englishMessages)) {
      if (!(key in translatedMessages)) {
        continue
      }

      if (
        typeof englishValue !== "string" ||
        icuHeaderPattern.test(englishValue)
      ) {
        icuHeaderPattern.lastIndex = 0
        continue
      }

      const expected = [
        ...(englishValue.match(placeholderPattern) ?? []),
      ].sort()
      if (expected.length === 0) {
        continue
      }

      const translatedValue = translatedMessages[key]
      expect(typeof translatedValue, key).toBe("string")
      expect(
        [
          ...((translatedValue as string).match(placeholderPattern) ?? []),
        ].sort(),
        key,
      ).toEqual(expected)
    }
  })

  test.each(locales)("%s preserves ICU arguments and branches", (locale) => {
    const translatedMessages = flattenMessages(messagesByLocale[locale])

    for (const [key, englishValue] of Object.entries(englishMessages)) {
      if (!(key in translatedMessages)) {
        continue
      }

      if (typeof englishValue !== "string") {
        continue
      }

      const expected = getIcuStructures(englishValue)
      if (expected.length === 0) {
        continue
      }

      const translatedValue = translatedMessages[key]
      expect(typeof translatedValue, key).toBe("string")
      expect(getIcuStructures(translatedValue as string), key).toEqual(expected)
    }
  })

  test("registry, metadata, and catalog filenames use the same sorted locales", () => {
    const messageFilenames = readdirSync(
      new URL("../messages", import.meta.url),
    )
      .filter((filename) => filename.endsWith(".json"))
      .map((filename) => filename.slice(0, -".json".length))
      .sort()

    expect([...locales]).toEqual([...locales].sort())
    expect(Object.keys(localeMeta).sort()).toEqual([...locales])
    expect(messageFilenames).toEqual([...locales])
    expect(Object.keys(messagesByLocale).sort()).toEqual([...locales])
  })

  test.each(
    cjkCatalogLocales,
  )("%s preserves newline counts from English", (locale) => {
    const translatedMessages = flattenMessages(messagesByLocale[locale])

    for (const [key, translatedValue] of Object.entries(translatedMessages)) {
      expect(typeof englishMessages[key], key).toBe("string")
      expect(typeof translatedValue, key).toBe("string")
      expect((translatedValue as string).split("\n").length, key).toBe(
        (englishMessages[key] as string).split("\n").length,
      )
    }
  })

  test.each(
    cjkCatalogLocales,
  )("%s contains no generated token markers or zero-width characters", (locale) => {
    const translatedMessages = flattenMessages(messagesByLocale[locale])

    for (const [key, translatedValue] of Object.entries(translatedMessages)) {
      expect(typeof translatedValue, key).toBe("string")
      expect(translatedValue as string, key).not.toMatch(
        forbiddenGeneratedTokenPattern,
      )
      expect(translatedValue as string, key).not.toMatch(zeroWidthPattern)
    }
  })
})

describe("locale resolution", () => {
  test.each([
    ["pt", "pt-BR"],
    ["en-US", "en"],
    ["zh-Hant", "zh-TW"],
    ["zh-hant", "zh-TW"],
    ["ZH-HANT", "zh-TW"],
    ["zh-Hant-TW", "zh-TW"],
    ["zh-HK", "zh-TW"],
    ["zh-hk", "zh-TW"],
    ["zh-HK-x-private", "zh-TW"],
    ["zh-MO", "zh-TW"],
    ["zh-mo", "zh-TW"],
    ["zh-MO-x-private", "zh-TW"],
    ["zh-TW", "zh-TW"],
    ["zh-tw", "zh-TW"],
    ["zh-TW-x-private", "zh-TW"],
    ["zh-tw-x-private", "zh-TW"],
    ["zh-CN", expectedSimplifiedChineseLocale],
    ["zh-CN-x-private", expectedSimplifiedChineseLocale],
    ["zh-cn", expectedSimplifiedChineseLocale],
    ["ZH-CN", expectedSimplifiedChineseLocale],
    ["zh-Hans", expectedSimplifiedChineseLocale],
    ["zh-hans", expectedSimplifiedChineseLocale],
    ["zh-Hans-CN", expectedSimplifiedChineseLocale],
    ["zh", expectedSimplifiedChineseLocale],
    ["xx", "en"],
  ] as const)("resolves %s to %s", (input, expected) => {
    expect(resolveLocale(input)).toBe(expected)
  })

  test("Hebrew uses right-to-left direction", () => {
    expect(getDirection("he" satisfies Locale)).toBe("rtl")
  })
})
