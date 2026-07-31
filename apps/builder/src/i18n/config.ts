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
}

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value)
}

export function resolveLocale(value: string | undefined): Locale {
  if (!value) {
    return defaultLocale
  }
  if (isLocale(value)) {
    return value
  }

  const language = value.split("-")[0]
  if (!language) {
    return defaultLocale
  }
  if (language === "pt") {
    return "pt-PT"
  }

  return (
    locales.find((locale) => locale.split("-")[0] === language) ?? defaultLocale
  )
}
