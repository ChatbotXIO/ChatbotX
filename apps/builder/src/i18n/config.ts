export type Locale = (typeof locales)[number]

export const locales = ["en", "vi", "ar"] as const
export const defaultLocale: Locale = "en"
