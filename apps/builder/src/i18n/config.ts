export type Locale = (typeof locales)[number]

export const locales = ["en", "vi", "pt-BR"] as const
export const defaultLocale: Locale = "pt-BR"
