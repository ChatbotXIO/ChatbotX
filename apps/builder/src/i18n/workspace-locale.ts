const SUPPORTED_LOCALES = ["en", "vi"] as const
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

const DEFAULT_LOCALE: SupportedLocale = "en"

function toSupportedLocale(language: string): SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(language)
    ? (language as SupportedLocale)
    : DEFAULT_LOCALE
}

export async function loadWorkspaceMessages(language: string) {
  const locale = toSupportedLocale(language)
  const messages = (await import(`../../messages/${locale}.json`)).default
  return { locale, messages }
}
