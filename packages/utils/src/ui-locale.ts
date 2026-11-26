/** UI languages of the builder. One list, shared by the UI and server-side validation. */
export const locales = [
  "ar",
  "az",
  "da",
  "de",
  "en",
  "es",
  "fi",
  "fr",
  "he",
  "id",
  "it",
  "ja",
  "nl",
  "pt-BR",
  "pt-PT",
  "ro",
  "sv",
  "tr",
  "vi",
  "zh-CN",
  "zh-TW",
] as const

export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = "en"

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value)
}

function matchesLocaleTag(normalizedValue: string, localeTag: string) {
  return (
    normalizedValue === localeTag || normalizedValue.startsWith(`${localeTag}-`)
  )
}

export function resolveLocale(value: string | undefined): Locale {
  if (!value) {
    return defaultLocale
  }

  const normalizedValue = value.trim()
  if (isLocale(normalizedValue)) {
    return normalizedValue
  }

  const normalizedLower = normalizedValue.toLowerCase()
  const language = normalizedLower.split("-")[0]
  if (!language) {
    return defaultLocale
  }
  if (language === "pt") {
    return "pt-BR"
  }
  if (
    ["zh-hant", "zh-hk", "zh-mo", "zh-tw"].some((localeTag) =>
      matchesLocaleTag(normalizedLower, localeTag),
    )
  ) {
    return "zh-TW"
  }
  if (
    ["zh-cn", "zh-hans"].some((localeTag) =>
      matchesLocaleTag(normalizedLower, localeTag),
    )
  ) {
    return "zh-CN"
  }
  if (language === "zh") {
    return "zh-CN"
  }

  return (
    locales.find((locale) => locale.toLowerCase().split("-")[0] === language) ??
    defaultLocale
  )
}
