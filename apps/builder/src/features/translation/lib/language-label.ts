/**
 * Language codes an agent can pick as the customer's language: the common ISO
 * 639-1 codes plus the two Chinese scripts. Not limited to the 21 UI locales: a
 * customer can write in any language. Names come from `Intl.DisplayNames`, so
 * no per-language translation key is needed.
 */
export const COMMON_LANGUAGE_CODES = [
  "ar",
  "bg",
  "bn",
  "cs",
  "da",
  "de",
  "el",
  "en",
  "es",
  "fa",
  "fi",
  "fr",
  "he",
  "hi",
  "hr",
  "hu",
  "id",
  "it",
  "ja",
  "km",
  "ko",
  "lo",
  "ms",
  "my",
  "nl",
  "no",
  "pl",
  "pt",
  "ro",
  "ru",
  "sk",
  "sv",
  "sw",
  "ta",
  "th",
  "tl",
  "tr",
  "uk",
  "ur",
  "vi",
  "zh-Hans",
  "zh-Hant",
] as const

/** The language's name in the UI language (`es` -> "Spanish" / "Tiếng Tây Ban Nha"). */
export function languageLabel(code: string, uiLocale: string): string {
  try {
    return (
      new Intl.DisplayNames([uiLocale], { type: "language" }).of(code) ?? code
    )
  } catch {
    return code
  }
}

/** A short code for a badge: `es` -> `ES`, `zh-Hans` -> `ZH-S`, `zh-Hant` -> `ZH-T`. */
export function languageBadge(code: string): string {
  if (code === "zh-Hans") {
    return "ZH-S"
  }
  if (code === "zh-Hant") {
    return "ZH-T"
  }
  return code.split("-")[0]?.toUpperCase() ?? code.toUpperCase()
}
