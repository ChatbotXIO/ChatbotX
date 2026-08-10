export const locales = [
  "ar",
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
  "zh-TW",
] as const

export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = "en"

export const localeMeta: Record<
  Locale,
  { nativeLabel: string; dir: "ltr" | "rtl" }
> = {
  ar: { nativeLabel: "العربية", dir: "rtl" },
  da: { nativeLabel: "Dansk", dir: "ltr" },
  de: { nativeLabel: "Deutsch", dir: "ltr" },
  en: { nativeLabel: "English", dir: "ltr" },
  es: { nativeLabel: "Español", dir: "ltr" },
  fi: { nativeLabel: "Suomi", dir: "ltr" },
  fr: { nativeLabel: "Français", dir: "ltr" },
  he: { nativeLabel: "עברית", dir: "rtl" },
  id: { nativeLabel: "Bahasa Indonesia", dir: "ltr" },
  it: { nativeLabel: "Italiano", dir: "ltr" },
  ja: { nativeLabel: "日本語", dir: "ltr" },
  nl: { nativeLabel: "Nederlands", dir: "ltr" },
  "pt-BR": { nativeLabel: "Português (Brasil)", dir: "ltr" },
  "pt-PT": { nativeLabel: "Português (Portugal)", dir: "ltr" },
  ro: { nativeLabel: "Română", dir: "ltr" },
  sv: { nativeLabel: "Svenska", dir: "ltr" },
  tr: { nativeLabel: "Türkçe", dir: "ltr" },
  vi: { nativeLabel: "Tiếng Việt", dir: "ltr" },
  "zh-TW": { nativeLabel: "繁體中文", dir: "ltr" },
}

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value)
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
    normalizedLower === "zh-hant" ||
    normalizedLower.startsWith("zh-hant-") ||
    normalizedLower === "zh-hk" ||
    normalizedLower.startsWith("zh-hk-") ||
    normalizedLower === "zh-mo" ||
    normalizedLower.startsWith("zh-mo-") ||
    normalizedLower === "zh-tw" ||
    normalizedLower.startsWith("zh-tw-")
  ) {
    return "zh-TW"
  }
  if (
    normalizedLower === "zh-cn" ||
    normalizedLower.startsWith("zh-cn-") ||
    normalizedLower === "zh-hans" ||
    normalizedLower.startsWith("zh-hans-")
  ) {
    return defaultLocale
  }
  if (language === "zh") {
    return defaultLocale
  }

  return (
    locales.find((locale) => locale.toLowerCase().split("-")[0] === language) ??
    defaultLocale
  )
}
